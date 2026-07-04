# KubeTopo — Copilot instructions

KubeTopo turns OpenTelemetry traces and Kubernetes signals into a **live,
understandable service-communication graph**. This is the management monorepo:
three components live side by side, each keeping its own build, docs, and history.

## Repository layout

| Folder | What it is | Stack |
| --- | --- | --- |
| `backend/` | Telemetry ingestion → normalization → topology inference → rolling aggregation → graph snapshot API (REST + SSE), 24h persistence | Java 21, Spring Boot 3.4.x, Maven |
| `frontend/` | Renders processed graph snapshots as a column-based topology graph; styles edges by load / latency / errors; scrubs history | React 19, TypeScript 5.8, Vite 6 |
| `example/` | Demo ticketing workload (auth / order / ticket) that generates realistic traffic + OTel traces | Java 21, Spring Boot 3.4.x, Maven (multi-module) |

## Data flow

```
example workload → OTel Collector / Beyla → (OTLP/HTTP) → backend → (REST + SSE graph snapshots) → frontend
```

- The **backend is the source of truth**: it consumes OTLP, builds the live graph,
  aggregates per-edge metrics, persists a rolling 24h window, and publishes
  UI-ready snapshots.
- The **frontend only renders** processed snapshots — it never ingests or
  recomputes telemetry.

## Build / test / run

```bash
# Backend (graph API on :8080)
cd backend && mvn spring-boot:run
cd backend && mvn test            # full test suite

# Frontend (Vite dev server)
cd frontend && npm install && npm run dev
cd frontend && npm run build      # tsc -b && vite build

# Example workload (multi-module Maven build)
cd example && mvn package
```

## Conventions

- **Stay in the right folder.** Each component is independent; don't reach across
  `backend/`, `frontend/`, and `example/` boundaries. Scoped rules live in
  [.github/instructions](instructions) and apply automatically by path.
- **Docs are part of the source of truth.** When you change behavior, models,
  endpoints, configuration, or infrastructure, update the matching document in the
  same change:
  - backend → `backend/docs/`
  - frontend → `frontend/docs/`
  - example → `example/README.md`
- **Naming:** the project spelling is **kubetopo**. The Java base
  package is `com.kubetopo`; the example uses `com.example`.
- Prefer small, testable components over large classes. Use realistic domain
  naming (auth, order, ticket, node, edge, snapshot) over generic placeholders.

## Specialized agents

Repo-scoped agents live in [.github/agents](agents):
`backend-developer`, `frontend-developer`, and `example-workload-developer`.
Reusable task prompts live in [.github/prompts](prompts).
