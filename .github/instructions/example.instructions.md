---
applyTo: 'example/**'
description: 'KubeTopo example ticketing workload (traffic / OTel trace generator) conventions'
---

# Example workload instructions

The example is a multi-service **ticketing platform** whose purpose is to generate
realistic service-to-service and service-to-database traffic, emitting
OpenTelemetry traces and metrics consumed by the backend.

## Stack & layout

- **Java 21**, **Spring Boot 3.4.x**, **Maven** multi-module
  (`groupId com.example`, artifact `ticketing-system`).
- Modules: `auth-service`, `order-service`, `ticket-service`.

| Service | Port | Role |
| --- | --- | --- |
| `auth-service` | 8081 | Demo JWT auth — login + token validation (in-memory users) |
| `order-service` | 8082 | Client-facing API — creates orders, calls downstream services |
| `ticket-service` | 8083 | Issues tickets, sends a mocked confirmation email |

Data: `order-service` → `orderdb`, `ticket-service` → `ticketdb`
(PostgreSQL in k8s, H2 in `dev`); `auth-service` is stateless.

## Working rules

- Services communicate over **HTTP first** (gRPC can be added later).
- Each service exposes a small, realistic business API, a health endpoint, and
  generates outbound calls where appropriate — the goal is observable interactions.
- Keep business logic intentionally simple; favor realistic domain naming
  (auth, order, ticket, event, notification) over generic names like A/B/C.
- Prefer small, testable Spring components over large classes.
- Runs locally on Minikube; each service can run standalone with embedded H2
  (`-Dspring-boot.run.profiles=dev`).
- **Update `example/README.md` in the same change** when you alter services,
  ports, APIs, data dependencies, or the deployment flow.
