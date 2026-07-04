---
applyTo: 'frontend/**'
description: 'KubeTopo frontend (React / TypeScript / Vite topology UI) conventions'
---

# Frontend instructions

The frontend renders **service-to-service communication** as a column-based
topology graph, styles edges by load / latency / errors, and lets the user scrub
through historical graph snapshots.

## Stack

- **React 19** + **TypeScript** (`~5.8`), **Vite 6** for dev/build.
- No UI framework — rendering is hand-rolled **SVG** with inline styles.
- No state library — local `useState` + custom hooks.
- Package name: `kubetopo-frontend`.

## Source of truth

The **backend is the source of truth**. The frontend only renders processed
snapshots (nodes + edges + per-pod metrics) — it never ingests or recomputes
telemetry. Match the backend response contract documented in
`frontend/docs/backend-api.md` and `frontend/docs/data-model.md`.

## Config

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend base URL |
| `VITE_GRAPH_SNAPSHOT_PATH` | `/api/graph` | REST snapshot endpoint |
| `VITE_GRAPH_STREAM_PATH` | `/api/graph/stream` | SSE live-update endpoint |

`USE_MOCK` in `src/App.tsx` toggles a static `mockSnapshot` for offline UI work.

## Working rules

- Keep rendering logic in the documented pipeline:
  snapshot → columns → layout → edges → SVG.
- Put layout variants behind the pluggable strategies (`src/strategies/`).
- Build with `npm run build` (`tsc -b && vite build`); keep it type-clean.
- **Update `frontend/docs/` in the same change** when you alter the data model,
  consumed endpoints, rendering pipeline, strategies, components, hooks, helpers,
  or the visual language.
