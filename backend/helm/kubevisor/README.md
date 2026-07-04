# KubeVisor Helm chart

Installs the full KubeVisor stack: the **backend** (graph API + OTLP/HTTP
ingestion), the **frontend** topology UI, a **PostgreSQL** store, the **RBAC**
the backend needs to read pod status, and an optional bundled **OpenTelemetry
Collector** that feeds it. Every resource is placed in the `kubevisor` namespace
(`namespace.name`).

The backend is telemetry-source agnostic: ingestion is exposed on the standard
OTLP/HTTP port `4318`, so any collector — bundled or pre-existing — can export to
it. The graph API stays on `8080`; the frontend's nginx proxies `/api` to it.

## Install

```bash
# From this directory (backend/helm/), with the backend + frontend images
# available to the cluster (e.g. built into Minikube's docker).
# The chart creates and owns the kubevisor namespace:
helm install kubevisor ./kubevisor

# Render without installing (inspect the generated manifests):
helm template kubevisor ./kubevisor

# Upgrade with overrides:
helm upgrade kubevisor ./kubevisor \
  --set backend.image.tag=0.2.0 \
  --set postgres.auth.password=$(openssl rand -hex 16)

# Uninstall:
helm uninstall kubevisor
```

> By default the chart **creates** the `kubevisor` namespace (`namespace.create`)
> and pins every resource to it (`namespace.name`). If you prefer Helm itself to
> own the install namespace, install with
> `-n kubevisor --create-namespace --set namespace.create=false`.

## Values

### Common

| Key | Default | Description |
| --- | --- | --- |
| `nameOverride` | `""` | Override the chart name used in resource names. |
| `fullnameOverride` | `"kubevisor"` | Override the resource-name prefix (else the release name). |
| `imagePullSecrets` | `[]` | Pull secrets applied to every pod. |
| `namespace.name` | `kubevisor` | Namespace all resources are placed in (empty → release namespace). |
| `namespace.create` | `true` | Create the namespace as part of the release. |

### Backend

| Key | Default | Description |
| --- | --- | --- |
| `backend.replicaCount` | `1` | Backend replicas. |
| `backend.image.repository` | `kubevisor-backend` | Backend image repo. |
| `backend.image.tag` | `""` | Image tag (falls back to `Chart.appVersion`). |
| `backend.image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `backend.api.port` | `8080` | Graph API / management port (`SERVER_PORT`). |
| `backend.otlp.httpPort` | `4318` | OTLP/HTTP ingestion port (`KUBEVISOR_OTLP_HTTP_PORT`). `0` or `== api.port` serves ingestion on the main port only. |
| `backend.service.type` | `ClusterIP` | Backend Service type. |
| `backend.service.apiPort` | `8080` | Service port for the graph API. |
| `backend.service.otlpPort` | `4318` | Service port for OTLP/HTTP ingestion. |
| `backend.springProfile` | `k8s` | `SPRING_PROFILES_ACTIVE` (selects PostgreSQL). |
| `backend.staleThresholdSeconds` | `120` | Idle node/edge cleanup window (`KUBEVISOR_STALE_THRESHOLD_SECONDS`). |
| `backend.extraEnv` | `[]` | Extra env for advanced `kubevisor.*` tuning (thresholds, memory-limit-bytes, etc.). |
| `backend.resources` | cpu 200m–500m / mem 256–512Mi | Backend resource requests/limits. |
| `backend.podAnnotations` | `{}` | Annotations on the backend pod. |

### Frontend

| Key | Default | Description |
| --- | --- | --- |
| `frontend.enabled` | `true` | Deploy the topology UI (nginx serving the SPA, proxying `/api` to the backend). |
| `frontend.replicaCount` | `1` | Frontend replicas. |
| `frontend.image.repository` | `kubevisor-frontend` | Frontend image repo. |
| `frontend.image.tag` | `""` | Image tag (falls back to `Chart.appVersion`). |
| `frontend.image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `frontend.service.type` | `ClusterIP` | Frontend Service type. |
| `frontend.service.port` | `80` | Service port the UI is exposed on. |
| `frontend.backendUrl` | `""` | Backend URL nginx proxies `/api` to (empty → in-cluster backend Service FQDN; nginx resolves it at request time, so it must be fully-qualified). |
| `frontend.resources` | cpu 50m–200m / mem 64–128Mi | Frontend resource requests/limits. |
| `frontend.podAnnotations` | `{}` | Annotations on the frontend pod. |

### RBAC / ServiceAccount

| Key | Default | Description |
| --- | --- | --- |
| `serviceAccount.create` | `true` | Create the backend ServiceAccount. |
| `serviceAccount.name` | `""` | SA name (generated when empty). |
| `serviceAccount.annotations` | `{}` | SA annotations (e.g. IRSA / Workload Identity). |
| `rbac.create` | `true` | Create the `pods: list` ClusterRole + binding. |

### PostgreSQL (bundled)

| Key | Default | Description |
| --- | --- | --- |
| `postgres.enabled` | `true` | Deploy bundled PostgreSQL. `false` → use `externalDatabase`. |
| `postgres.image.repository` | `postgres` | Postgres image repo. |
| `postgres.image.tag` | `16-alpine` | Postgres image tag. |
| `postgres.image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `postgres.auth.database` | `kubevisor` | Database name. |
| `postgres.auth.username` | `kubevisor` | Database user. |
| `postgres.auth.password` | `changeme-local-dev` | **Demo-only** password — replace for non-local. |
| `postgres.auth.existingSecret` | `""` | Use an existing Secret (`POSTGRES_USER/PASSWORD/DB`) instead. |
| `postgres.persistence.enabled` | `true` | Use a PVC (`false` → `emptyDir`, data lost on restart). |
| `postgres.persistence.size` | `2Gi` | PVC size. |
| `postgres.persistence.storageClass` | `""` | StorageClass (empty → cluster default). |
| `postgres.service.port` | `5432` | Postgres Service port. |
| `postgres.resources` | cpu 100m–250m / mem 128–256Mi | Postgres resource requests/limits. |

### External database (when `postgres.enabled: false`)

| Key | Default | Description |
| --- | --- | --- |
| `externalDatabase.host` | `""` | DB host (required). |
| `externalDatabase.port` | `5432` | DB port. |
| `externalDatabase.database` | `kubevisor` | DB name. |
| `externalDatabase.existingSecret` | `""` | Secret with DB credentials (required). |
| `externalDatabase.userKey` | `POSTGRES_USER` | Secret key for the username. |
| `externalDatabase.passwordKey` | `POSTGRES_PASSWORD` | Secret key for the password. |

### OpenTelemetry Collector (bundled, optional)

| Key | Default | Description |
| --- | --- | --- |
| `otelCollector.enabled` | `true` | Deploy a bundled collector. Disable to use an existing one pointed at the backend `:4318`. |
| `otelCollector.image.repository` | `otel/opentelemetry-collector-contrib` | Collector image repo. |
| `otelCollector.image.tag` | `0.98.0` | Collector image tag. |
| `otelCollector.image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `otelCollector.backendEndpoint` | `""` | Export target (empty → in-cluster backend OTLP service). |
| `otelCollector.kubeletStats.enabled` | `true` | Scrape kubelet CPU/memory (needs node access). |
| `otelCollector.kubeletStats.collectionInterval` | `15s` | Kubelet scrape interval. |
| `otelCollector.service.grpcPort` | `4317` | Collector OTLP gRPC port. |
| `otelCollector.service.httpPort` | `4318` | Collector OTLP/HTTP port. |
| `otelCollector.resources` | cpu 100m–500m / mem 256–512Mi | Collector resource requests/limits. |

### Beyla (passive eBPF network-flow capture, optional)

Disabled by default. When enabled, runs a **privileged** `host-network`/`host-PID`
DaemonSet that captures service-to-service edges for **un-instrumented** workloads
(no OTel SDK). Enable deliberately, and pin it to chosen nodes with
`nodeSelector` / `tolerations` / `affinity`.

| Key | Default | Description |
| --- | --- | --- |
| `beyla.enabled` | `false` | Deploy the Beyla DaemonSet. |
| `beyla.image.repository` | `grafana/beyla` | Beyla image repo. |
| `beyla.image.tag` | `latest` | Beyla image tag. |
| `beyla.image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `beyla.otlpEndpoint` | `""` | OTLP endpoint Beyla exports to (empty → bundled collector's OTLP/HTTP service). |
| `beyla.network.source` | `socket_filter` | Passive eBPF capture source. |
| `beyla.contextPropagation` | `disabled` | eBPF context propagation (keep disabled — avoids CNI conflicts). |
| `beyla.discovery` | `[]` | Optional namespaces + open ports for app-level instrumentation (network-flow capture works without it). |
| `beyla.nodeSelector` | `{}` | Restrict the DaemonSet to matching nodes. |
| `beyla.tolerations` | `[]` | DaemonSet tolerations. |
| `beyla.affinity` | `{}` | DaemonSet affinity. |
| `beyla.serviceAccount.create` / `.name` | `true` / `""` | Beyla ServiceAccount. |
| `beyla.rbac.create` | `true` | Create Beyla's ClusterRole + binding. |
| `beyla.resources` | cpu 100m–500m / mem 256–512Mi | Beyla resource requests/limits. |

```bash
# Enable Beyla, pinned to Linux worker nodes:
helm upgrade kubevisor ./kubevisor --reuse-values \
  --set beyla.enabled=true \
  --set 'beyla.nodeSelector.kubernetes\.io/os=linux'
```

## Not yet included

- **Ingress** — the UI and API are `ClusterIP`; use `kubectl port-forward` or add
  your own Ingress in front of the `kubevisor-frontend` Service.

## Images

The chart references two images you must build and make available to the cluster:

| Image | Build context | Default ref |
| --- | --- | --- |
| Backend | `backend/` | `kubevisor-backend:<appVersion>` |
| Frontend | `frontend/` | `kubevisor-frontend:<appVersion>` |

```bash
# Minikube example:
eval $(minikube docker-env)
( cd backend  && mvn -q -DskipTests package && docker build -t kubevisor-backend:0.1.0 . )
( cd frontend && docker build -t kubevisor-frontend:0.1.0 . )
```

