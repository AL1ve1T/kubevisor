# Ticketing System — Kubernetes Observability Example

A multi-service ticketing platform designed to generate realistic service-to-service traffic and OpenTelemetry traces for Kubernetes observability experiments.

## Architecture

```
┌──────────┐     ┌───────────────┐     ┌────────────────┐
│  Client   │────▶│ order-service │────▶│ ticket-service │
│           │     │   :8082       │     │   :8083        │
└──────────┘     └───────┬───────┘     └───────┬────────┘
                         │                      │
                         ▼                      ▼
                 ┌───────────────┐      Mocked email
                 │ auth-service  │      notification
                 │   :8081       │
                 └───────────────┘
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| **auth-service** | 8081 | Demo JWT authentication — login and token validation |
| **order-service** | 8082 | Client-facing API — creates orders, calls ticket-service |
| **ticket-service** | 8083 | Issues tickets, sends mocked confirmation emails |

### Data

- **order-service** → `orderdb` (PostgreSQL in k8s, H2 in dev)
- **ticket-service** → `ticketdb` (PostgreSQL in k8s, H2 in dev)
- **auth-service** → in-memory user store (no database)

## Prerequisites

- Java 21
- Maven 3.9+
- Docker
- Minikube + kubectl

## Local Development (dev profile)

Each service can run independently with an embedded H2 database.

```bash
# Terminal 1 — auth-service
mvn spring-boot:run -pl auth-service

# Terminal 2 — order-service (needs auth-service running)
mvn spring-boot:run -pl order-service -Dspring-boot.run.profiles=dev

# Terminal 3 — ticket-service (needs to be running for order-service calls)
mvn spring-boot:run -pl ticket-service -Dspring-boot.run.profiles=dev
```

## Deploy to Minikube

```bash
# Start Minikube
minikube start

# Run the deployment script (builds images + applies manifests)
chmod +x k8s/deploy.sh
./k8s/deploy.sh

# Port-forward to access services locally
kubectl port-forward svc/auth-service 8081:8081 &
kubectl port-forward svc/order-service 8082:8082 &
kubectl port-forward svc/ticket-service 8083:8083 &
```

## Smoke Test

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}' | jq -r '.token')

# 2. Create an order (issues tickets automatically)
curl -s -X POST http://localhost:8082/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"customerName":"Alice","eventName":"Spring Concert 2026","quantity":3}'

# 3. List orders
curl -s http://localhost:8082/api/orders \
  -H "Authorization: Bearer $TOKEN"

# 4. List tickets for order 1
curl -s "http://localhost:8083/api/tickets?orderId=1"
```

### Demo Users

| Username | Password |
|----------|----------|
| alice | password123 |
| bob | password456 |
| charlie | password789 |

## API Reference

### auth-service

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login with `{"username","password"}` → `{"token"}` |
| POST | `/auth/validate` | Validate token `{"token"}` → `{"valid","username"}` |

### order-service (requires `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/orders` | Create order `{"customerName","eventName","quantity"}` |
| GET | `/api/orders/{id}` | Get order by ID |
| GET | `/api/orders` | List all orders |

### ticket-service

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tickets` | Issue tickets `{"orderId","eventName","quantity"}` |
| GET | `/api/tickets/{id}` | Get ticket by ID |
| GET | `/api/tickets?orderId=` | List tickets by order |

## Observability

All services include Spring Boot Actuator with Micrometer Tracing (OpenTelemetry bridge). Traces are exported via OTLP to the endpoint configured in `OTEL_EXPORTER_OTLP_ENDPOINT`.

Health check: `GET /actuator/health` on each service.

## Tech Stack

- Java 21, Spring Boot 3.4.x, Maven
- Spring Data JPA (H2 / PostgreSQL)
- jjwt (JWT handling)
- Micrometer Tracing + OpenTelemetry OTLP exporter
- Docker (multi-stage builds)
- Kubernetes (plain YAML manifests)
