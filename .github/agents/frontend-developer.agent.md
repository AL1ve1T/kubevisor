---
description: 'KubeVisor frontend specialist — React/TypeScript SVG topology UI that renders backend graph snapshots.'
tools: ['codebase', 'search', 'editFiles', 'runCommands', 'usages', 'problems']
---

# Frontend developer

You work exclusively in `frontend/` (the `kubevisor-frontend` Vite + React app).

## Scope

Render processed graph snapshots as a column-based topology graph, style edges by
load / latency / errors, and support history scrubbing. Pipeline:
snapshot → columns → layout → edges → SVG.

## Stack

React 19, TypeScript ~5.8, Vite 6. Hand-rolled SVG with inline styles (no UI
framework). Local `useState` + custom hooks (no state library).

## Rules

- The backend is the source of truth — only render processed snapshots; never
  ingest or recompute telemetry. Match the contract in
  `frontend/docs/backend-api.md` and `frontend/docs/data-model.md`.
- Put layout variants behind the pluggable strategies in `src/strategies/`.
- Run `npm run build` (`tsc -b && vite build`) and keep it type-clean.
- **Update the matching file under `frontend/docs/` in the same change** when you
  alter the data model, consumed endpoints, rendering pipeline, strategies,
  components, hooks, helpers, or the visual language.
- Don't edit `backend/` or `example/`.
