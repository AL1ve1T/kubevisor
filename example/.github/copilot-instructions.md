This repository contains the example Kubernetes workload for a ticketing-system-based Kubernetes observability hobby project.

Project purpose:
- Generate realistic service-to-service and service-to-database traffic through a simple ticketing system domain.
- Emit OpenTelemetry traces and metrics that will be consumed by a separate backend project.
- Provide realistic request flows such as authentication, order creation, ticket issuing, and mocked email sending.

Architecture assumptions:
- There are three services: auth-service, order-service, and ticket-service.
- auth-service is responsible for demo authentication and token validation.
- order-service is the client-facing API that orchestrates ticket ordering flows.
- ticket-service is the core business service that issues tickets, manages ticket-related data, and mocks confirmation email sending.
- There are separate data dependencies for services where needed.
- Services communicate over HTTP first. gRPC can be added later.
- Each service should expose a small, realistic business API and generate outbound calls to other services where appropriate.
- The system should be easy to run locally with Minikube.

Implementation preferences:
- Add health endpoints for each service.
- Model the system as a simple ticketing platform rather than generic demo services.
- auth-service should provide login and token validation endpoints.
- order-service should expose order-related endpoints and call downstream services.
- ticket-service should contain ticket issuance logic and a mocked email-sending side effect.

When generating code:
- Prefer small, testable Spring components over large classes.
- Prefer realistic domain naming such as auth, order, ticket, event, and notification over generic names like A, B, and C.

- Keep business logic intentionally simple; the goal of this repo is to generate realistic, observable interactions in a ticketing workflow.
