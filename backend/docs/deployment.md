# Deployment

The project targets **local development first** and **Minikube** for Kubernetes.
Manifests are plain YAML (no Helm) under `k8s/`, optimized for clarity over
production hardening.

## Container image

`Dockerfile` is a minimal single-stage build over `eclipse-temurin:21-jre-alpine`:
it copies the built `target/kubevisor-backend-*.jar`, exposes `8080` (graph API)
and `4318` (OTLP/HTTP ingestion), and runs `java -jar app.jar`. Build the jar with
Maven **before** building the image (`mvn -q -DskipTests package`).

## Kubernetes manifests (`k8s/`)

| File | Contents |
| --- | --- |
| `namespace.yml` | The `kubevisor` namespace. |
| `deployment.yml` | `kubevisor-backend` Deployment (profile `k8s`, `DB_*` from a Secret, `/actuator/health` probes; exposes `8080` + OTLP `4318`). |
| `service.yml` | Service exposing the backend on `8080` (graph API) and `4318` (OTLP/HTTP ingestion). |
| `postgres.yml` | PostgreSQL Deployment/Service + secret for 24h+ snapshot history. |
| `otel-collector.yml` | OTel Collector: OTLP receivers, `kubeletstats` receiver, `k8sattributes` processor, OTLP/HTTP exporter to the backend, plus its RBAC. |
| `beyla.yml` | Beyla eBPF DaemonSet for passive network-flow topology metrics. |
| `rbac.yml` | ServiceAccount + RBAC for the backend's Kubernetes API access. |

### Backend Deployment notes

- Activates the `k8s` profile (`SPRING_PROFILES_ACTIVE=k8s`) → PostgreSQL.
- `DB_USERNAME` / `DB_PASSWORD` come from the `kubevisor-postgres-secret` Secret.
- `KUBEVISOR_STALE_THRESHOLD_SECONDS` overrides the stale cleanup window.
- `KUBEVISOR_OTLP_HTTP_PORT` (default `4318`) sets the OTLP/HTTP ingestion port —
  the dedicated, standard OTLP/HTTP port the collector exports to, separate from
  the graph API port `8080`.
- Liveness/readiness on `/actuator/health` (port `8080`).

### OTel Collector

The collector is the single ingress for telemetry into the backend:

- **Receivers:** `otlp` (gRPC 4317, HTTP 4318) and `kubeletstats` (CPU/memory,
  15s interval, `serviceAccount` auth, scrapes `https://$K8S_NODE_NAME:10250`).
- **Processors:** `batch` and `k8sattributes` (annotates metrics with
  `k8s.namespace.name`, `k8s.pod.name`, `k8s.deployment.name`,
  `k8s.replicaset.name` so the backend resolves workload names).
- **Exporter:** `otlphttp/kubevisor_backend` with `encoding: json`, endpoint from
  the `KUBEVISOR_BACKEND_ENDPOINT` env var (the backend's OTLP/HTTP port `4318`).
  - Backend on the host (local dev): `http://host.docker.internal:4318`.
  - Backend in-cluster: `http://kubevisor-backend.kubevisor.svc.cluster.local:4318`.
- The OTLP endpoint must use a **Kubernetes DNS name**, never a hardcoded ClusterIP.
- `k8s.container.memory_limit_utilization` is intentionally **not** enabled on
  Minikube — the backend derives memory ratio from `container.memory.working_set`
  divided by `kubevisor.memory-limit-bytes`.

### Beyla (passive eBPF)

Beyla provides network-flow topology metrics. **Keep it passive** — these
settings must not change without good reason (see
`.github/instructions/beyla.instructions.md`):

- `javaagent.enabled: false`, `context_propagation: disabled` (avoids CNI conflicts).
- `network.enable: true`, `source: socket_filter` (passive, CNI-compatible).
- `hostNetwork: true` + `hostPID: true`, with `dnsPolicy: ClusterFirstWithHostNet`
  so cluster DNS works.
- Exports metrics via `otel_metrics_export` to the collector DNS name.
- Do not enable `trace_printer` outside debugging (high-volume stdout noise).
- RBAC needs pods/services/nodes (list/watch) and apps/replicasets (list/watch).

The backend reads Beyla's `beyla.network.flow.bytes` metric and its
`k8s.src.owner.name` / `k8s.dst.owner.name` attributes — see
[telemetry-pipeline.md](telemetry-pipeline.md).

## Telemetry routing in Minikube

From the verified repo notes (`/memories/repo/minikube-telemetry-routing.md`):

- Pods can reach a host-run backend at `host.docker.internal:4318` (OTLP/HTTP
  ingestion); the graph API is on `8080`.
- `host.minikube.internal` was **not** reachable from pods in this environment.
- If the backend runs locally (not in-cluster), point the collector's
  `KUBEVISOR_BACKEND_ENDPOINT` at the host and restart the collector.
- An empty graph can also be caused by stale cleanup under low traffic, not just
  routing — verify with a local `GET /api/graph`.

## Typical Minikube bring-up

```bash
mvn -q -DskipTests package
eval $(minikube docker-env)          # build image into Minikube's docker
docker build -t kubevisor-backend:latest .
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/                 # postgres, rbac, backend, service, collector, beyla
```

When adding/altering a manifest, keep names, ports, and env vars explicit and
update this document.

## Helm chart (`helm/kubevisor`)

For installing into an arbitrary cluster, a Helm chart packages the backend,
frontend UI, PostgreSQL, RBAC, and an optional bundled OTel Collector. The raw
`k8s/` manifests remain the source of truth for local Minikube; the chart
templates the same resources with configurable values (image, ports, DB,
collector toggle) and places everything in the `kubevisor` namespace.

```bash
# The chart creates and owns the kubevisor namespace:
helm install kubevisor ./helm/kubevisor

helm template kubevisor ./helm/kubevisor                 # render only
helm upgrade  kubevisor ./helm/kubevisor --set backend.image.tag=0.2.0
```

- All resources land in `namespace.name` (default `kubevisor`); the chart creates
  it (`namespace.create`). To let Helm own the namespace instead, install with
  `-n kubevisor --create-namespace --set namespace.create=false`.
- The **frontend** (`frontend.enabled`) is an nginx image that serves the SPA and
  proxies `/api` to the backend Service — build it from `frontend/` as
  `kubevisor-frontend`. Disable with `frontend.enabled=false`.
- Ingestion is exposed on OTLP/HTTP `4318` (`backend.otlp.httpPort`), so the
  bundled collector — or any existing cluster collector — exports to
  `<release>-backend:4318`. Set `otelCollector.enabled=false` to use your own.
- Use `postgres.enabled=false` + `externalDatabase.*` to point at a managed
  PostgreSQL; set `postgres.auth.existingSecret` for externally-managed creds.
- **Beyla** (`beyla.enabled`, default off) adds the passive eBPF network-flow
  DaemonSet for un-instrumented workloads; pin it to nodes via
  `beyla.nodeSelector` / `tolerations` / `affinity`.

See [helm/kubevisor/README.md](../helm/kubevisor/README.md) for the full values
reference.
