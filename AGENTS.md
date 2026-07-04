# AGENTS.md

Guidance for AI coding agents (Copilot, Claude, Cursor, …) working in the
**KubeTopo** monorepo. KubeTopo turns OpenTelemetry traces and Kubernetes
signals into a live service-communication graph.

## Structure

Three independent components live side by side, each with its own build and docs:

| Folder | What it is | Stack |
| --- | --- | --- |
| `backend/` | Telemetry ingestion → normalization → topology inference → rolling aggregation → graph snapshot API (REST + SSE), 24h persistence | Java 21, Spring Boot 3.4.x, Maven |
| `frontend/` | Renders processed graph snapshots as a column-based topology graph | React 19, TypeScript 5.8, Vite 6 |
| `example/` | Demo ticketing workload (auth / order / ticket) that generates traffic + OTel traces | Java 21, Spring Boot 3.4.x, Maven multi-module |

Data flow: `example → OTel Collector / Beyla → (OTLP/HTTP) → backend → (REST + SSE) → frontend`.
The **backend is the source of truth**; the **frontend only renders** snapshots.

## Build, test, run

```bash
# Backend (graph API on :8080)
cd backend && mvn spring-boot:run
cd backend && mvn test

# Frontend (Vite dev server)
cd frontend && npm install && npm run dev
cd frontend && npm run build      # tsc -b && vite build

# Example workload (multi-module)
cd example && mvn package
```

## Conventions

- **Stay in one component.** Don't reach across `backend/`, `frontend/`, and
  `example/` boundaries in a single change.
- **Docs are part of the source of truth.** Update `backend/docs/`,
  `frontend/docs/`, or `example/README.md` in the same change as any behavior,
  model, endpoint, configuration, or infrastructure change.
- **Naming:** spelling is **kubetopo**. Java base package
  `com.kubetopo` (example uses `com.example`).
- Prefer small, testable components; use realistic domain naming.

## Detailed instructions

Path-scoped rules and specialized agents live under `.github/`:

- `.github/copilot-instructions.md` — monorepo overview (auto-loaded)
- `.github/instructions/*.instructions.md` — per-component rules (by `applyTo`)
- `.github/agents/*.agent.md` — `backend-developer`, `frontend-developer`,
  `example-workload-developer`
- `.github/prompts/*.prompt.md` — reusable task prompts
