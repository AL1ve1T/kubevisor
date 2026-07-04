---
mode: agent
description: 'Run the full KubeTopo stack locally (backend + frontend + example workload).'
---

Help me run the KubeTopo stack locally for development. Start the components in
order and confirm each is healthy before moving on:

1. Backend graph API on `:8080` — `cd backend && mvn spring-boot:run`.
2. Frontend Vite dev server — `cd frontend && npm install && npm run dev`.
3. Example ticketing workload — `cd example && mvn package`, then run the services
   (`auth-service` :8081, `order-service` :8082, `ticket-service` :8083) per
   `example/README.md`.

Note that the frontend reads `VITE_API_BASE_URL` (default `http://localhost:8080`).
Flag any port conflicts and stop running processes cleanly when I'm done.
