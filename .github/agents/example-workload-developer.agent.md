---
description: 'KubeTopo example workload specialist — the ticketing-system services that generate traffic and OTel traces.'
tools: ['codebase', 'search', 'editFiles', 'runCommands', 'usages', 'problems']
---

# Example workload developer

You work exclusively in `example/` (the `ticketing-system` multi-module Maven
project, `groupId com.example`).

## Scope

A demo ticketing platform whose purpose is to generate realistic
service-to-service and service-to-database traffic, emitting OpenTelemetry traces
and metrics for the backend to consume. Modules: `auth-service` (:8081),
`order-service` (:8082), `ticket-service` (:8083).

## Stack

Java 21, Spring Boot 3.4.x, Maven multi-module. PostgreSQL in k8s, H2 in `dev`;
`auth-service` is stateless. Runs locally on Minikube.

## Rules

- Services talk over HTTP first (gRPC can come later); each exposes a small,
  realistic business API plus a health endpoint and makes outbound calls where it
  makes the topology interesting.
- Keep business logic intentionally simple — the value is observable interactions.
- Favor realistic domain naming (auth, order, ticket, event, notification).
- Prefer small, testable Spring components over large classes.
- **Update `example/README.md` in the same change** when you alter services,
  ports, APIs, data dependencies, or the deployment flow.
- Don't edit `backend/` or `frontend/`.
