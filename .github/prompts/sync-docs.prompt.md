---
mode: agent
description: 'Verify component docs are in sync with the code changes in this change set.'
---

Review the current change set and verify the documentation is in sync, per the
repo rule that docs are part of the source of truth.

For each changed file, confirm the matching docs were updated in the same change:

- `backend/**` → the relevant file in `backend/docs/` (architecture, domain-model,
  telemetry-pipeline, api, configuration, deployment, development).
- `frontend/**` → the relevant file in `frontend/docs/` (data-model, backend-api,
  rendering-pipeline, strategies, components, hooks, helpers, visual-language).
- `example/**` → `example/README.md`.

List any behavior, model, endpoint, configuration, or infrastructure change whose
docs were NOT updated, and draft the missing doc edits. Don't invent features that
aren't in the code.
