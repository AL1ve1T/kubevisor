package com.kubeflow.parsing;

import java.time.Instant;
import java.util.Map;

/**
 * Intermediate representation of a span extracted from an OTLP payload.
 * This is OpenTelemetry-specific; domain logic should use InteractionEvent
 * instead.
 */
public record ParsedSpan(
        String traceId,
        String spanId,
        String parentSpanId,
        String serviceName,
        String serviceNamespace,
        String spanName,
        String spanKind,
        long startTimeUnixNano,
        long endTimeUnixNano,
        int statusCode,
        Map<String, String> attributes,
        Map<String, String> resourceAttributes) {

    public double durationMs() {
        return (endTimeUnixNano - startTimeUnixNano) / 1_000_000.0;
    }

    public Instant startInstant() {
        return Instant.ofEpochSecond(0, startTimeUnixNano);
    }

    public boolean isError() {
        return statusCode == 2; // OTEL STATUS_CODE_ERROR
    }

    public boolean isServerSpan() {
        return "SPAN_KIND_SERVER".equals(spanKind) || "2".equals(spanKind);
    }

    public boolean isClientSpan() {
        return "SPAN_KIND_CLIENT".equals(spanKind) || "3".equals(spanKind);
    }
}
