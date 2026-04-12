#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building JARs locally with Maven..."
mvn -f "${SCRIPT_DIR}/../pom.xml" clean package -DskipTests -B

echo "==> Building Docker images inside Minikube..."
eval $(minikube docker-env)

docker build -t auth-service:latest -f auth-service/Dockerfile "${SCRIPT_DIR}/.."
docker build -t order-service:latest -f order-service/Dockerfile "${SCRIPT_DIR}/.."
docker build -t ticket-service:latest -f ticket-service/Dockerfile "${SCRIPT_DIR}/.."

echo "==> Deploying PostgreSQL..."
kubectl apply -f "${SCRIPT_DIR}/postgres.yaml"
echo "    Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres --timeout=120s

echo "==> Deploying OpenTelemetry Collector..."
kubectl apply -f "${SCRIPT_DIR}/otel-collector.yaml"
echo "    Waiting for OTel Collector to be ready..."
kubectl wait --for=condition=ready pod -l app=otel-collector --timeout=240s

echo "==> Deploying auth-service..."
kubectl apply -f "${SCRIPT_DIR}/auth-service.yaml"

echo "==> Deploying order-service..."
kubectl apply -f "${SCRIPT_DIR}/order-service.yaml"

echo "==> Deploying ticket-service..."
kubectl apply -f "${SCRIPT_DIR}/ticket-service.yaml"

echo "==> Restarting deployments to pick up new images..."
kubectl rollout restart deployment/auth-service deployment/order-service deployment/ticket-service

echo "==> Waiting for all services to be ready..."
kubectl wait --for=condition=ready pod -l app=auth-service --timeout=120s
kubectl wait --for=condition=ready pod -l app=order-service --timeout=120s
kubectl wait --for=condition=ready pod -l app=ticket-service --timeout=120s

echo ""
echo "==> All services deployed successfully!"
echo ""
echo "To access the services, use port-forwarding:"
echo "  kubectl port-forward svc/auth-service 8081:8081"
echo "  kubectl port-forward svc/order-service 8082:8082"
echo "  kubectl port-forward svc/ticket-service 8083:8083"
