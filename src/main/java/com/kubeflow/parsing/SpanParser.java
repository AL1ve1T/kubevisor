package com.kubeflow.parsing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses raw OTLP/HTTP JSON trace payloads into ParsedSpan objects.
 * Handles the nested resourceSpans -> scopeSpans -> spans structure.
 */
@Component
public class SpanParser {

    private static final Logger log = LoggerFactory.getLogger(SpanParser.class);

    @SuppressWarnings("unchecked")
    public List<ParsedSpan> parseSpans(Map<String, Object> otlpPayload) {
        List<ParsedSpan> result = new ArrayList<>();

        List<Map<String, Object>> resourceSpans = getList(otlpPayload, "resourceSpans");
        for (Map<String, Object> rs : resourceSpans) {
            String serviceName = extractServiceName(rs);
            String serviceNamespace = extractServiceNamespace(rs);
            Map<String, String> resourceAttributes = extractResourceAttributes(rs);

            List<Map<String, Object>> scopeSpans = getList(rs, "scopeSpans");
            for (Map<String, Object> ss : scopeSpans) {
                List<Map<String, Object>> spans = getList(ss, "spans");
                for (Map<String, Object> span : spans) {
                    try {
                        result.add(parseSpan(span, serviceName, serviceNamespace, resourceAttributes));
                    } catch (Exception e) {
                        log.warn("Failed to parse span: {}", e.getMessage());
                    }
                }
            }
        }
        return result;
    }

    private ParsedSpan parseSpan(Map<String, Object> span, String serviceName, String serviceNamespace,
            Map<String, String> resourceAttributes) {
        String traceId = getString(span, "traceId");
        String spanId = getString(span, "spanId");
        String parentSpanId = getString(span, "parentSpanId");
        String spanName = getString(span, "name");
        String spanKind = String.valueOf(span.getOrDefault("kind", "0"));

        long startTimeUnixNano = parseLong(span.get("startTimeUnixNano"));
        long endTimeUnixNano = parseLong(span.get("endTimeUnixNano"));

        int statusCode = extractStatusCode(span);
        Map<String, String> attributes = extractAttributes(getList(span, "attributes"));

        return new ParsedSpan(
                traceId, spanId, parentSpanId,
                serviceName, serviceNamespace,
                spanName, spanKind,
                startTimeUnixNano, endTimeUnixNano,
                statusCode, attributes, resourceAttributes);
    }

    @SuppressWarnings("unchecked")
    private String extractServiceName(Map<String, Object> resourceSpan) {
        Map<String, Object> resource = getMap(resourceSpan, "resource");
        List<Map<String, Object>> attrs = getList(resource, "attributes");
        return findAttributeValue(attrs, "service.name");
    }

    @SuppressWarnings("unchecked")
    private String extractServiceNamespace(Map<String, Object> resourceSpan) {
        Map<String, Object> resource = getMap(resourceSpan, "resource");
        List<Map<String, Object>> attrs = getList(resource, "attributes");
        return findAttributeValue(attrs, "service.namespace");
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> extractResourceAttributes(Map<String, Object> resourceSpan) {
        Map<String, Object> resource = getMap(resourceSpan, "resource");
        List<Map<String, Object>> attrs = getList(resource, "attributes");
        return extractAttributes(attrs);
    }

    @SuppressWarnings("unchecked")
    private int extractStatusCode(Map<String, Object> span) {
        Map<String, Object> status = getMap(span, "status");
        Object code = status.get("code");
        if (code instanceof Number n)
            return n.intValue();
        if (code instanceof String s) {
            try {
                return Integer.parseInt(s);
            } catch (NumberFormatException e) {
                /* ignore */ }
        }
        return 0;
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> extractAttributes(List<Map<String, Object>> attrs) {
        Map<String, String> result = new HashMap<>();
        for (Map<String, Object> attr : attrs) {
            String key = getString(attr, "key");
            Map<String, Object> value = getMap(attr, "value");
            String strVal = extractStringValue(value);
            if (key != null && strVal != null) {
                result.put(key, strVal);
            }
        }
        return result;
    }

    private String extractStringValue(Map<String, Object> value) {
        if (value.containsKey("stringValue"))
            return String.valueOf(value.get("stringValue"));
        if (value.containsKey("intValue"))
            return String.valueOf(value.get("intValue"));
        if (value.containsKey("boolValue"))
            return String.valueOf(value.get("boolValue"));
        return null;
    }

    @SuppressWarnings("unchecked")
    private String findAttributeValue(List<Map<String, Object>> attrs, String key) {
        for (Map<String, Object> attr : attrs) {
            if (key.equals(attr.get("key"))) {
                Map<String, Object> value = getMap(attr, "value");
                return extractStringValue(value);
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> getList(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof List<?> list)
            return (List<Map<String, Object>>) list;
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> getMap(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof Map<?, ?> m)
            return (Map<String, Object>) m;
        return Collections.emptyMap();
    }

    private static String getString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? String.valueOf(val) : null;
    }

    private static long parseLong(Object val) {
        if (val instanceof Number n)
            return n.longValue();
        if (val instanceof String s) {
            try {
                return Long.parseLong(s);
            } catch (NumberFormatException e) {
                /* ignore */ }
        }
        return 0;
    }
}
