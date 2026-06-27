#!/usr/bin/env bash
#
# Trust test: prove the live graph reports real traffic.
#
# Drives EXACTLY <RPS> requests/second at each demo service for <DURATION>
# seconds, waits for the telemetry to propagate, then reads
# GET /api/graph and asserts the reported inbound requests-per-second for each
# service matches <RPS> within <TOLERANCE>.
#
# Why this proves the number is real:
#   The backend reports RPS as the number of requests observed in the last
#   completed one-second interval. If we sustain exactly 10 req/s, the only
#   value the graph can honestly report is ~10.0. A wrong/synthetic number would
#   not track the load we generated.
#
# Requirements: bash, curl, jq, awk (kubectl only if AUTO_PORT_FORWARD=true).
# Runs on the host against a live Minikube stack. Exits non-zero on failure.
#
# ---------------------------------------------------------------------------
# Configuration (override via environment variables)
# ---------------------------------------------------------------------------
set -euo pipefail

RPS="${RPS:-10}"                       # target requests/second per service
DURATION="${DURATION:-90}"             # seconds to sustain load (>= WINDOW_FILL + sampling + margin)
WINDOW_FILL="${WINDOW_FILL:-30}"        # seconds to wait before sampling. Must exceed the telemetry
                                       # export lag (SDK BatchSpanProcessor + collector batch processor
                                       # flush in chunks ~15-25s) plus ~1s for the current second to
                                       # complete, or sampling catches the climb mid-flight and under-reports.
SAMPLES="${SAMPLES:-6}"                # number of /api/graph samples to average
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-3}" # seconds between samples
TOLERANCE="${TOLERANCE:-1.5}"          # allowed |reported - RPS| (batchy export → use a margin)

NAMESPACE="${NAMESPACE:-default}"                 # namespace the demo services run in
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
REQUEST_METHOD="${REQUEST_METHOD:-GET}"           # HTTP method used to load each service
REQUEST_PATH="${REQUEST_PATH:-/}"                 # HTTP path hit on each service
REQUEST_BODY="${REQUEST_BODY:-}"                  # optional request body (e.g. JSON) sent with each request
REQUEST_CONTENT_TYPE="${REQUEST_CONTENT_TYPE:-application/json}" # Content-Type used when REQUEST_BODY is set
SOURCE_FILTER="${SOURCE_FILTER:-}"                # optional: only count inbound edges from this source node id
                                                  # (e.g. "external") to ignore service-to-service cascades

# Demo services to load, space-separated "<graph-node-id>=<k8s-service>:<port>".
# <graph-node-id> is how the backend labels the node (normally the workload name).
SERVICES="${SERVICES:-auth-service=auth-service:8080 order-service=order-service:8080 ticket-service=ticket-service:8080}"

AUTO_PORT_FORWARD="${AUTO_PORT_FORWARD:-true}"    # port-forward each service via kubectl
LOCAL_PORT_BASE="${LOCAL_PORT_BASE:-18100}"       # first local port used for port-forwards

# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------
WORKDIR="$(mktemp -d)"
PF_PIDS=""
LOAD_PIDS=""

log()  { printf '%s %s\n' "[$(date +%H:%M:%S)]" "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
  # Stop load generators and port-forwards.
  for p in $LOAD_PIDS; do kill "$p" >/dev/null 2>&1 || true; done
  for p in $PF_PIDS;   do kill "$p" >/dev/null 2>&1 || true; done
  wait >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
for bin in curl jq awk; do
  command -v "$bin" >/dev/null 2>&1 || fail "required command not found: $bin"
done
if [ "$AUTO_PORT_FORWARD" = "true" ]; then
  command -v kubectl >/dev/null 2>&1 || fail "AUTO_PORT_FORWARD=true but kubectl not found"
fi

# Float helpers (awk avoids a bc dependency).
fadd() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.4f", a + b}'; }
fdiv() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.4f", (b==0?0:a / b)}'; }
fabs() { awk -v a="$1" 'BEGIN{printf "%.4f", (a<0?-a:a)}'; }
fle()  { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a <= b)}'; }   # a <= b ?

# ---------------------------------------------------------------------------
# Parse the SERVICES config into parallel, index-addressed arrays
# (kept bash-3.2 compatible — no associative arrays).
# ---------------------------------------------------------------------------
NODE_IDS=""        # space-separated graph node ids
SVC_COUNT=0

i=0
for entry in $SERVICES; do
  node="${entry%%=*}"          # graph-node-id
  svcport="${entry#*=}"        # k8s-service:port
  svc="${svcport%%:*}"
  port="${svcport##*:}"
  [ -n "$node" ] && [ -n "$svc" ] && [ -n "$port" ] || fail "bad SERVICES entry: '$entry'"

  if [ "$AUTO_PORT_FORWARD" = "true" ]; then
    localport=$((LOCAL_PORT_BASE + i))
    log "port-forward svc/$svc ($NAMESPACE) -> localhost:$localport"
    kubectl -n "$NAMESPACE" port-forward "svc/$svc" "$localport:$port" >/dev/null 2>&1 &
    PF_PIDS="$PF_PIDS $!"
    url="http://localhost:${localport}${REQUEST_PATH}"
  else
    # Without auto port-forward the service must already be reachable on its port.
    url="http://${svc}:${port}${REQUEST_PATH}"
  fi

  eval "NODE_$i=\$node"
  eval "URL_$i=\$url"
  NODE_IDS="$NODE_IDS $node"
  i=$((i + 1))
done
SVC_COUNT=$i
[ "$SVC_COUNT" -gt 0 ] || fail "no services configured"

if [ "$AUTO_PORT_FORWARD" = "true" ]; then
  log "waiting for port-forwards to establish..."
  sleep 3
fi

# Verify the backend is reachable before generating load.
curl -fsS -o /dev/null "$BACKEND_URL/api/graph" \
  || fail "backend not reachable at $BACKEND_URL/api/graph"

# ---------------------------------------------------------------------------
# Load generation — send EXACTLY (RPS * DURATION) requests, evenly paced,
# anchored to a fixed start time so there is no cumulative drift.
# ---------------------------------------------------------------------------
# A single curl process per service drives that service's entire load. curl's
# serial --rate paces request *starts* at exactly RPS/second; because each
# request completes in a few milliseconds this holds a steady rate WITHOUT
# forking a process per request (the per-request approach exhausts the host's
# `ulimit -u` once RPS x services gets large, throttling the real send rate).
generate_load() {
  url="$1"; codefile="$2"; idx="$3"
  total=$((RPS * DURATION))

  # Build a curl config with one transfer per request. Each transfer gets its
  # own `output = /dev/null` so the response body is discarded and only the
  # -w status code reaches the code file. (A single global -o would apply to
  # the first URL only, leaking the remaining bodies to stdout.)
  cfg="$WORKDIR/curlcfg_$idx"
  awk -v n="$total" -v u="$url" 'BEGIN{
    for (k = 0; k < n; k++) { print "url = \"" u "\""; print "output = \"/dev/null\"" }
  }' > "$cfg"

  set -- -sS --rate "${RPS}/s" -w '%{http_code}\n' -X "$REQUEST_METHOD"
  if [ -n "$REQUEST_BODY" ]; then
    set -- "$@" -H "Content-Type: $REQUEST_CONTENT_TYPE" --data "$REQUEST_BODY"
  fi
  curl "$@" -K "$cfg" >> "$codefile" 2>/dev/null || true
}

log "starting load: ${RPS} req/s x ${SVC_COUNT} services for ${DURATION}s (method=${REQUEST_METHOD} path=${REQUEST_PATH})"
i=0
while [ "$i" -lt "$SVC_COUNT" ]; do
  eval "url=\$URL_$i"
  eval "node=\$NODE_$i"
  codefile="$WORKDIR/codes_$i"
  : > "$codefile"
  log "  -> $node via $url"
  generate_load "$url" "$codefile" "$i" &
  LOAD_PIDS="$LOAD_PIDS $!"
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# Wait for telemetry to propagate, then sample the live graph.
# ---------------------------------------------------------------------------
log "load running; waiting ${WINDOW_FILL}s for telemetry to propagate before sampling..."
sleep "$WINDOW_FILL"

# Sum of reported inbound RPS for a node, optionally restricted to one source.
reported_inbound_rps() {
  node="$1"
  if [ -n "$SOURCE_FILTER" ]; then
    jq --arg n "$node" --arg s "$SOURCE_FILTER" \
      '[.[].edges[] | select(.targetNodeId==$n and .sourceNodeId==$s) | .requestsPerSecond] | add // 0'
  else
    jq --arg n "$node" \
      '[.[].edges[] | select(.targetNodeId==$n) | .requestsPerSecond] | add // 0'
  fi
}

# Accumulate per-service sampled RPS.
i=0
while [ "$i" -lt "$SVC_COUNT" ]; do eval "SUM_$i=0"; i=$((i + 1)); done

s=0
while [ "$s" -lt "$SAMPLES" ]; do
  snapshot="$(curl -fsS "$BACKEND_URL/api/graph?namespace=$NAMESPACE")" \
    || fail "failed to read $BACKEND_URL/api/graph"
  line="sample $((s + 1))/$SAMPLES:"
  i=0
  while [ "$i" -lt "$SVC_COUNT" ]; do
    eval "node=\$NODE_$i"
    rps="$(printf '%s' "$snapshot" | reported_inbound_rps "$node")"
    eval "prev=\$SUM_$i"
    eval "SUM_$i=$(fadd "$prev" "$rps")"
    line="$line  $node=$rps"
    i=$((i + 1))
  done
  log "$line"
  s=$((s + 1))
  [ "$s" -lt "$SAMPLES" ] && sleep "$SAMPLE_INTERVAL"
done

# ---------------------------------------------------------------------------
# Trust report
# ---------------------------------------------------------------------------
echo
echo "================ TRUST REPORT ================"
printf 'Target: %s req/s per service | window-fill: %ss | samples: %s | tolerance: +/-%s\n' \
  "$RPS" "$WINDOW_FILL" "$SAMPLES" "$TOLERANCE"
if [ -n "$SOURCE_FILTER" ]; then
  echo "Counting only inbound edges from source: $SOURCE_FILTER"
fi
echo "---------------------------------------------"

overall_pass=1
i=0
while [ "$i" -lt "$SVC_COUNT" ]; do
  eval "node=\$NODE_$i"
  eval "sum=\$SUM_$i"
  avg="$(fdiv "$sum" "$SAMPLES")"
  delta="$(fabs "$(awk -v a="$avg" -v r="$RPS" 'BEGIN{printf "%.4f", a - r}')")"

  # Requests actually sent (and HTTP success count) from the load generator.
  codefile="$WORKDIR/codes_$i"
  sent="$(wc -l < "$codefile" | tr -d ' ')"
  ok="$(grep -c '^2[0-9][0-9]$' "$codefile" 2>/dev/null || echo 0)"

  if fle "$delta" "$TOLERANCE"; then
    verdict="PASS"
  else
    verdict="FAIL"; overall_pass=0
  fi
  printf '%-16s reported=%6s req/s (target %s, dlt %s)  sent=%s ok=%s  -> %s\n' \
    "$node" "$avg" "$RPS" "$delta" "$sent" "$ok" "$verdict"
  i=$((i + 1))
done
echo "============================================="

if [ "$overall_pass" -eq 1 ]; then
  echo "RESULT: PASS — the graph reports the real load within tolerance."
  exit 0
else
  echo "RESULT: FAIL — reported RPS deviates from generated load beyond tolerance."
  exit 1
fi
