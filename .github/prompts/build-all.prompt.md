---
mode: agent
description: 'Build and test all three KubeTopo components and report results.'
---

Build and test every component of the KubeTopo monorepo, then summarize pass/fail
per component.

1. Backend: run `mvn test` in `backend/`.
2. Frontend: run `npm install` (if needed) then `npm run build` in `frontend/`.
3. Example: run `mvn package` in `example/`.

Report each component's result. If anything fails, show the relevant error output
and propose the smallest fix. Do not change unrelated code.
