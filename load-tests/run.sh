#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default URLs (local port-forwarded)
export AUTH_URL="${AUTH_URL:-http://localhost:8081}"
export ORDER_URL="${ORDER_URL:-http://localhost:8082}"
export TICKET_URL="${TICKET_URL:-http://localhost:8083}"

usage() {
  echo "Usage: $0 <scenario> [k6-flags...]"
  echo ""
  echo "Scenarios:"
  echo "  full-order-flow   End-to-end: login → order → verify → tickets"
  echo "  auth-spike        Burst login/validate traffic"
  echo "  read-heavy        Seed orders then hammer read endpoints"
  echo "  mixed-workload    Realistic 70% read / 20% write / 10% auth mix"
  echo "  escalation          Staged 10x RPS increase via port-forward (local)"
  echo "  escalation-nodeport Same escalation via NodePort — genuine external traffic"
  echo "  escalation-cluster  Same escalation but runs as a k8s Job inside the cluster"
  echo "  all                 Run all scenarios sequentially"
  echo ""
  echo "Environment variables:"
  echo "  AUTH_URL    (default: http://localhost:8081)"
  echo "  ORDER_URL   (default: http://localhost:8082)"
  echo "  TICKET_URL  (default: http://localhost:8083)"
  echo ""
  echo "Examples:"
  echo "  $0 full-order-flow"
  echo "  $0 auth-spike --vus 50 --duration 30s"
  echo "  $0 mixed-workload --out json=results.json"
  echo "  $0 escalation"
  echo "  $0 escalation-nodeport"
  echo "  $0 escalation-cluster"
  exit 1
}

# Prints pod restarts and status every 5s in the background.
# Call with the PID file path; kill with stop_pod_watcher.
start_pod_watcher() {
  local pidfile="$1"
  (
    local apps="auth-service,order-service,ticket-service"
    local header_printed=0
    while true; do
      local line
      line=$(kubectl get pods -l "app in (${apps})" --no-headers \
        --sort-by='.metadata.name' 2>/dev/null \
        | awk '{printf "  %-45s %-10s %-10s %s\n", $1, $2, $3, $4}')
      if [[ $header_printed -eq 0 ]]; then
        echo ""
        echo "[POD WATCHER] Monitoring restarts — Ctrl-C to abort"
        echo "  $(printf '%-45s %-10s %-10s %s' NAME READY STATUS RESTARTS)"
        header_printed=1
      fi
      echo "[$(date +%H:%M:%S)]" && echo "${line}"
      sleep 5
    done
  ) &
  echo $! >"$pidfile"
}

stop_pod_watcher() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
  fi
}

run_scenario() {
  local name="$1"
  shift
  echo "========================================"
  echo "Running: ${name}"
  echo "========================================"
  k6 run "$SCRIPT_DIR/scenarios/${name}.js" "$@"
  echo ""
}

if [[ $# -lt 1 ]]; then
  usage
fi

SCENARIO="$1"
shift

case "$SCENARIO" in
  full-order-flow|auth-spike|read-heavy|mixed-workload)
    run_scenario "$SCENARIO" "$@"
    ;;
  escalation)
    WATCHER_PID_FILE="$(mktemp)"
    trap 'stop_pod_watcher "$WATCHER_PID_FILE"' EXIT INT TERM
    echo ""
    echo "Stage plan:"
    echo "  Stage 1:   1 RPS × 30s  — warmup"
    echo "  Stage 2:  10 RPS × 60s  — light load"
    echo "  Stage 3: 100 RPS × 60s  — moderate pressure"
    echo "  Stage 4: 1000 RPS × 60s — heavy load (pods may terminate)"
    echo ""
    start_pod_watcher "$WATCHER_PID_FILE"
    run_scenario "escalation" "$@"
    stop_pod_watcher "$WATCHER_PID_FILE"
    echo ""
    echo "=== Final pod state ==="
    kubectl get pods -l 'app in (auth-service,order-service,ticket-service)'
    ;;
  escalation-nodeport)
    WATCHER_PID_FILE="$(mktemp)"
    TUNNEL_DIR="$(mktemp -d)"
    # minikube's Docker driver does not route the VM bridge IP to macOS.
    # `minikube service --url` creates a localhost proxy tunnel instead.
    echo ""
    echo "Starting minikube service tunnels (Docker driver workaround)..."
    minikube service auth-service    --url 2>/dev/null >"$TUNNEL_DIR/auth"    &
    minikube service order-service   --url 2>/dev/null >"$TUNNEL_DIR/order"   &
    minikube service ticket-service  --url 2>/dev/null >"$TUNNEL_DIR/ticket"  &
    TUNNEL_PIDS="$!"
    # Wait for the tunnel processes to print their URLs
    sleep 4
    MINIKUBE_AUTH_URL="$(head -1 "$TUNNEL_DIR/auth")"
    MINIKUBE_ORDER_URL="$(head -1 "$TUNNEL_DIR/order")"
    MINIKUBE_TICKET_URL="$(head -1 "$TUNNEL_DIR/ticket")"
    if [[ -z "$MINIKUBE_AUTH_URL" || -z "$MINIKUBE_ORDER_URL" || -z "$MINIKUBE_TICKET_URL" ]]; then
      echo "ERROR: Could not get tunnel URLs from minikube. Output:"
      cat "$TUNNEL_DIR/auth" "$TUNNEL_DIR/order" "$TUNNEL_DIR/ticket"
      kill $TUNNEL_PIDS 2>/dev/null; rm -rf "$TUNNEL_DIR"; exit 1
    fi
    trap 'stop_pod_watcher "$WATCHER_PID_FILE"; kill $(cat "$TUNNEL_DIR/pids" 2>/dev/null) 2>/dev/null; rm -rf "$TUNNEL_DIR"' EXIT INT TERM
    echo "  auth-service  → $MINIKUBE_AUTH_URL"
    echo "  order-service → $MINIKUBE_ORDER_URL"
    echo "  ticket-service→ $MINIKUBE_TICKET_URL"
    echo ""
    echo "Stage plan (NodePort via minikube tunnel — genuine external traffic):"
    echo "  Stage 1:   1 RPS × 30s  — warmup"
    echo "  Stage 2:  10 RPS × 60s  — light load"
    echo "  Stage 3: 100 RPS × 60s  — moderate pressure"
    echo "  Stage 4: 1000 RPS × 60s — heavy load (pods may terminate)"
    echo ""
    start_pod_watcher "$WATCHER_PID_FILE"
    AUTH_URL="$MINIKUBE_AUTH_URL" \
    ORDER_URL="$MINIKUBE_ORDER_URL" \
    TICKET_URL="$MINIKUBE_TICKET_URL" \
    k6 run "$SCRIPT_DIR/scenarios/escalation.js" "$@"
    stop_pod_watcher "$WATCHER_PID_FILE"
    echo ""
    echo "=== Final pod state ==="
    kubectl get pods -l 'app in (auth-service,order-service,ticket-service)'
    ;;
  escalation-cluster)
    REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    WATCHER_PID_FILE="$(mktemp)"
    trap 'stop_pod_watcher "$WATCHER_PID_FILE"' EXIT INT TERM
    echo ""
    echo "Stage plan (in-cluster):"
    echo "  Stage 1:   1 RPS × 30s  — warmup"
    echo "  Stage 2:  10 RPS × 60s  — light load"
    echo "  Stage 3: 100 RPS × 60s  — moderate pressure"
    echo "  Stage 4: 1000 RPS × 60s — heavy load (pods may terminate)"
    echo ""

    # Build ConfigMap from the current script file
    echo "[1/4] Uploading k6 script as ConfigMap..."
    kubectl create configmap k6-escalation-scripts \
      --from-file=escalation-cluster.js="$SCRIPT_DIR/scenarios/escalation-cluster.js" \
      --dry-run=client -o yaml | kubectl apply -f -

    # Remove any prior Job (Jobs are immutable once created)
    echo "[2/4] Removing previous k6 job (if any)..."
    kubectl delete job k6-escalation --ignore-not-found

    # Apply the Job
    echo "[3/4] Launching k6 Job..."
    kubectl apply -f "$REPO_ROOT/k8s/load-test-job.yaml"

    # Wait for the k6 pod to be scheduled and start
    echo "[4/4] Waiting for k6 pod to start..."
    kubectl wait pod -l app=k6-escalation --for=condition=Ready --timeout=60s 2>/dev/null || true

    echo ""
    echo "Streaming k6 logs (Ctrl-C to detach, job continues in cluster):"
    start_pod_watcher "$WATCHER_PID_FILE"
    kubectl logs -f job/k6-escalation || true
    stop_pod_watcher "$WATCHER_PID_FILE"

    echo ""
    echo "=== Final pod state ==="
    kubectl get pods -l 'app in (auth-service,order-service,ticket-service)'
    echo ""
    echo "=== k6 Job status ==="
    kubectl get job k6-escalation
    ;;
  all)
    for s in full-order-flow auth-spike read-heavy mixed-workload; do
      run_scenario "$s" "$@"
    done
    ;;
  *)
    echo "Error: Unknown scenario '$SCENARIO'"
    usage
    ;;
esac
