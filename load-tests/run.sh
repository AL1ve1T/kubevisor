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
  echo "  all               Run all scenarios sequentially"
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
  exit 1
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
