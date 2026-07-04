# KubeTopo

Frontend for a Kubernetes observability tool. It renders **service-to-service
communication** as a column-based topology graph, styles edges by load / latency /
errors, and lets you scrub through historical graph snapshots.

The backend is the **source of truth** — the frontend only renders processed
snapshots (nodes + edges + per-pod metrics). It never ingests or recomputes
telemetry.

## Quick start

```bash
npm install
npm run dev      # vite dev server
npm run build    # tsc -b && vite build
npm run preview  # preview production build
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend base URL. **Empty string ⇒ same-origin** (requests resolve against `window.location.origin`), used by the container image so nginx can proxy `/api` to the backend. |
| `VITE_GRAPH_SNAPSHOT_PATH` | `/api/graph` | REST snapshot endpoint |
| `VITE_GRAPH_STREAM_PATH` | `/api/graph/stream` | SSE live-update endpoint |

`USE_MOCK` in [src/App.tsx](src/App.tsx) renders a static
[mockSnapshot](src/data/mockSnapshot.ts) for offline UI work.

## Demo mode (no backend)

A standalone, hostable demo lets visitors paste their own `kubectl` YAML (or pick a
sample), then watch their cluster render and react to a chosen load profile —
entirely in the browser, no backend required.

```bash
npm run dev:demo     # vite dev server in demo mode
npm run build:demo   # static bundle for hosting (add --base=/<subpath>/ if needed)
```

It is enabled by `VITE_DEMO_MODE=true` (see [.env.demo](.env.demo)) or a `?demo`
query param. The live app is unaffected. See [docs/demo.md](docs/demo.md) for how
manifests are parsed, dependencies inferred, and load simulated.

## Container image

[Dockerfile](Dockerfile) builds the SPA and serves it with nginx on port `8080`.
The image is built with an empty `VITE_API_BASE_URL` so the app calls the backend
**same-origin**; nginx reverse-proxies `/api` (REST + SSE) to the URL in the
`BACKEND_URL` env var ([nginx/default.conf.template](nginx/default.conf.template)).

```bash
docker build -t kubetopo-frontend:0.1.0 .
docker run -p 8080:8080 -e BACKEND_URL=http://host.docker.internal:8080 kubetopo-frontend:0.1.0
```

The KubeTopo Helm chart deploys this image and sets `BACKEND_URL` to the
in-cluster backend Service — see `backend/helm/kubetopo/`.

## Documentation

Full documentation lives in [docs/](docs/README.md):

| Doc | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Overview + doc index |
| [docs/architecture.md](docs/architecture.md) | System context, data flow, directory layout |
| [docs/data-model.md](docs/data-model.md) | DTOs: snapshot, node, edge, pod, timeline points |
| [docs/backend-api.md](docs/backend-api.md) | Endpoints consumed and the response contract |
| [docs/rendering-pipeline.md](docs/rendering-pipeline.md) | Snapshot → columns → layout → edges → SVG |
| [docs/strategies.md](docs/strategies.md) | Pluggable topology layout strategies |
| [docs/components.md](docs/components.md) | React component reference |
| [docs/hooks.md](docs/hooks.md) | Custom hooks reference |
| [docs/helpers.md](docs/helpers.md) | Geometry / edge / color helper reference |
| [docs/visual-language.md](docs/visual-language.md) | Metric → style mapping |
| [docs/demo.md](docs/demo.md) | Standalone, backend-free demo |

> **Keep docs in sync.** When you change code, update the matching file under
> `docs/`. See the documentation policy in
> [.github/copilot-instructions.md](.github/copilot-instructions.md).
