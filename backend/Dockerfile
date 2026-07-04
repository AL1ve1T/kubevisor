FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY target/kubetopo-backend-*.jar app.jar

# 8080: graph API (REST + SSE) consumed by the frontend.
# 4318: OTLP/HTTP ingestion endpoints (/v1/traces, /v1/metrics) — the standard
#       OTLP/HTTP port, so any OpenTelemetry Collector can export to the backend.
EXPOSE 8080 4318

ENTRYPOINT ["java", "-jar", "app.jar"]
