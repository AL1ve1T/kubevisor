# Development

## Prerequisites

- **JDK 21**
- **Maven** (or the bundled wrapper if present)
- Optional: **Minikube** + `kubectl` for the full telemetry path

## Build and run

```bash
# Build (runs tests)
mvn clean package

# Build without tests
mvn -q -DskipTests package

# Run locally (default profile → H2 file DB at ./data/kubevisor)
mvn spring-boot:run
# or
java -jar target/kubevisor-backend-*.jar
```

The backend starts on **http://localhost:8080**. Useful local URLs:

- Swagger UI: `http://localhost:8080/swagger-ui.html`
- Current graph: `http://localhost:8080/api/graph`
- SSE stream: `http://localhost:8080/api/graph/stream`
- H2 console: `http://localhost:8080/h2-console`
  (JDBC URL `jdbc:h2:file:./data/kubevisor`, user `sa`, no password)

## Testing

Unit tests are the priority for the MVP (keep fixtures small and readable).
Run the full suite:

```bash
mvn test
```

Existing test coverage (under `src/test/java/com/kubevisor`) targets the pipeline
stages that matter most:

- `parsing/SpanParserTest` — span field extraction.
- `normalization/SpanNormalizerTest` — span → `InteractionEvent`, direction resolution.
- `topology/TopologyResolverTest`, `topology/KubernetesPodWatcherTest` — target resolution, pod watching.
- `ingestion/NetworkFlowProcessorTest`, `ingestion/ResourceMetricsProcessorTest` — Beyla flows, kubeletstats metrics.
- `aggregation/GraphStateManagerTest`, `model/EdgeWindowTest` — rolling aggregation and per-second edge metrics.
- `cleanup/StaleGraphCleanerTest` — stale node/edge removal.
- `api/GraphUpdatePublisherTest` — SSE publishing.
- `persistence/*TimelineServiceTest`, `persistence/SnapshotPersistenceServiceTest` — history/timeline reconstruction.
- `support/PodStatusScraperTest` — pod health scraping.

When you add behavior, add or update the matching unit test in the same package.

## Trust test: verifying reported RPS against real load

To prove the live graph reports *real* traffic (not a synthetic or stale number),
`scripts/trust/rps-load-check.sh` drives a known, sustained request rate at the
demo services on a live Minikube stack and asserts the backend reports it back.

It generates **exactly `RPS` requests/second** per service, waits for the
telemetry to propagate, then reads `GET /api/graph` and checks that each
service's reported inbound RPS matches the generated rate within a tolerance.
Because `requestsPerSecond` is the number of requests observed in a single
completed second — bucketed by **span event time**, so a batch of spans is
spread back across the real seconds it covers — a faithful backend can only
report the rate that was actually driven.

> **Export lag matters.** The telemetry path batches spans (the service SDK's
> `BatchSpanProcessor` and the collector `batch` processor flush in chunks every
> ~15–25s), so a freshly started load takes a batch interval to show up. Once
> spans arrive they are bucketed by event time, so each completed second reports
> its true per-second count, and that value is **held** between batches (decaying
> to zero only after ~10s without traffic) instead of flickering off between
> flushes. `WINDOW_FILL` defaults to 30s so sampling happens after the first
> batch has propagated and load has been sustained; sampling earlier under-reports
> (you'll see e.g. ~6 rps mid-climb for a real 10 rps load).

```bash
# Defaults: 10 req/s x 3 services, ~75s, auto kubectl port-forward.
scripts/trust/rps-load-check.sh

# Common overrides:
RPS=10 NAMESPACE=demo REQUEST_PATH=/health \
  SERVICES="auth-service=auth-service:8080 order-service=order-service:8080 ticket-service=ticket-service:8080" \
  scripts/trust/rps-load-check.sh

# Ignore service-to-service cascades; count only externally driven traffic:
SOURCE_FILTER=external scripts/trust/rps-load-check.sh

# POST endpoint with a JSON body (e.g. auth-service login on :8081):
AUTO_PORT_FORWARD=false REQUEST_METHOD=POST REQUEST_PATH=/auth/login \
  REQUEST_BODY='{"username":"demo","password":"demo"}' \
  SERVICES="auth-service=localhost:8081" \
  scripts/trust/rps-load-check.sh
```

Key env vars: `RPS`, `DURATION`, `WINDOW_FILL`, `SAMPLES`, `TOLERANCE`,
`NAMESPACE`, `BACKEND_URL`, `REQUEST_METHOD`, `REQUEST_PATH`, `REQUEST_BODY`,
`REQUEST_CONTENT_TYPE`, `SERVICES`, `SOURCE_FILTER`, `AUTO_PORT_FORWARD`. The
script exits non-zero if any service's reported RPS deviates beyond `TOLERANCE`.
Requires `curl`, `jq`, `awk` (and `kubectl` when `AUTO_PORT_FORWARD=true`).

## Feeding telemetry locally

To exercise the pipeline without a cluster, POST an OTLP/HTTP JSON trace payload
to `/v1/traces` (or metrics to `/v1/metrics`). With a cluster, run the OTel
Collector and point its `KUBEVISOR_BACKEND_ENDPOINT` at the host
(`http://host.docker.internal:8080`) — see [deployment.md](deployment.md).

For pod-status/pod-IP enrichment without an in-cluster ServiceAccount, run
`kubectl proxy` (the scrapers default to `http://localhost:8001`) or rely on the
`kubectl get pods` subprocess fallback.

## Debugging an empty graph

A graph that is empty or keeps emptying usually means one of:

1. **No telemetry arriving** — check collector logs and the
   `KUBEVISOR_BACKEND_ENDPOINT` routing (`host.docker.internal`, **not**
   `host.minikube.internal`, in this environment).
2. **Stale cleanup outpacing traffic** — under low traffic, edges/nodes age out
   after `kubevisor.stale-threshold-seconds`. Raise it for quiet demos.
3. **Resource metrics zeroed** — utilization older than
   `resource-metric-stale-seconds` reports `0.0` and calms `loadLevel`.

Verify quickly with `curl http://localhost:8080/api/graph`.

## Conventions

- Java + Spring Boot; constructor injection; records for DTOs.
- Small, single-responsibility components; avoid deep inheritance.
- Keep OTel-specific parsing isolated from internal domain models.
- Don't add comments/docstrings/annotations to code you didn't change.
- Don't over-engineer — no abstractions or error handling for cases that can't happen.

## Documentation maintenance

When a change touches behavior, models, endpoints, configuration, or
infrastructure, update the relevant file in `docs/` in the **same** change.
The mapping is enforced by `.github/copilot-instructions.md` and the
`backend-developer` agent.
