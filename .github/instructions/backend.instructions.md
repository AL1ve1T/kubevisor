---
applyTo: 'backend/**'
description: 'KubeVisor backend (Java / Spring Boot telemetry-processing) conventions'
---

# Backend instructions

The backend ingests OpenTelemetry telemetry, transforms raw traces and metrics
into a live service-topology graph, aggregates rolling per-edge metrics, and
publishes frontend-ready snapshots over REST and SSE. It is a **domain-specific
topology-processing backend**, not a generic observability platform — it does not
replace Jaeger/Tempo/Prometheus and does not store raw spans.

## Stack

- **Java 21**, **Spring Boot 3.4.x**, **Maven** (artifact `kubevisor-backend`).
- Main class: `KubevisorBackendApplication`. Base package: `com.kubevisor`.
- In-memory live state + **PostgreSQL** persistence (**H2** for local dev),
  **Flyway** migrations, **OpenTelemetry** proto / protobuf for OTLP,
  **springdoc-openapi** for Swagger UI.

## Pipeline (package map)

`ingestion → parsing → normalization → topology → aggregation → api`, with
`persistence`, `cleanup`, `model`, and `support` alongside.

- `parse → normalize → resolve topology → aggregate → publish (REST + SSE)`
- Normalizes spans into `InteractionEvent` objects (direction-resolved edges).
- Aggregates per-edge RPS / latency / error rate and keeps live graph state.
- Publishes per-namespace `GraphSnapshot` objects; persists a rolling 24h window.

## Working rules

- Prefer small, testable Spring components over large classes.
- Build/test with `mvn test` (run from `backend/`); keep the suite green.
- Configuration keys use the `kubevisor.*` prefix; honor Spring profiles.
- **Update `backend/docs/` in the same change** when you alter behavior, the
  domain model, endpoints, configuration, or infrastructure. The matching doc is:
  architecture, domain-model, telemetry-pipeline, api, configuration, deployment,
  or development.
