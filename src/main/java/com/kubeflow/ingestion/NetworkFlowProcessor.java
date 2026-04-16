package com.kubeflow.ingestion;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.NodeType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Processes OTLP metrics payloads from Beyla network metrics.
 * Extracts network flow data (beyla.network.flow.bytes) and registers
 * topology edges in the graph based on pod-to-pod communication.
 */
@Component
public class NetworkFlowProcessor {

    private static final Logger log = LoggerFactory.getLogger(NetworkFlowProcessor.class);

    private static final String NETWORK_FLOW_METRIC = "beyla.network.flow.bytes";
    private static final Set<Integer> APPLICATION_PORTS = Set.of(8081, 8082, 8083, 5432);
    private static final int POSTGRES_PORT = 5432;

    private final GraphStateManager graphStateManager;

    public NetworkFlowProcessor(GraphStateManager graphStateManager) {
        this.graphStateManager = graphStateManager;
    }

    public void processMetrics(Map<String, Object> metricsPayload) {
        List<Map<String, Object>> resourceMetrics = getList(metricsPayload, "resourceMetrics");
        int flowCount = 0;

        for (Map<String, Object> rm : resourceMetrics) {
            List<Map<String, Object>> scopeMetrics = getList(rm, "scopeMetrics");
            for (Map<String, Object> sm : scopeMetrics) {
                List<Map<String, Object>> metrics = getList(sm, "metrics");
                for (Map<String, Object> metric : metrics) {
                    String name = getString(metric, "name");
                    if (NETWORK_FLOW_METRIC.equals(name)) {
                        flowCount += processNetworkFlowMetric(metric);
                    }
                }
            }
        }

        if (flowCount > 0) {
            log.info("Processed {} network flow data points into topology edges", flowCount);
        }
    }

    private int processNetworkFlowMetric(Map<String, Object> metric) {
        int count = 0;

        // Network flow bytes can be a sum, gauge, or histogram — check all
        List<Map<String, Object>> dataPoints = extractDataPoints(metric);
        for (Map<String, Object> dp : dataPoints) {
            Map<String, String> attrs = extractAttributes(getList(dp, "attributes"));

            String srcOwner = attrs.get("k8s.src.owner.name");
            String dstOwner = attrs.get("k8s.dst.owner.name");
            String srcNamespace = attrs.get("k8s.src.namespace");
            String dstNamespace = attrs.get("k8s.dst.namespace");
            String dstPortStr = attrs.get("dst.port");

            if (srcOwner == null || dstOwner == null) {
                continue;
            }

            // Skip empty owner names (unresolved pods)
            if (srcOwner.isEmpty() || dstOwner.isEmpty()) {
                continue;
            }

            // Skip self-referencing flows
            if (srcOwner.equals(dstOwner)) {
                continue;
            }

            // Filter to flows within the default namespace (demo services)
            if (!"default".equals(srcNamespace) || !"default".equals(dstNamespace)) {
                continue;
            }

            int dstPort = parsePort(dstPortStr);

            // Only include flows to known application ports (skip response/infra traffic)
            if (!APPLICATION_PORTS.contains(dstPort)) {
                continue;
            }
            NodeType targetType = resolveTargetType(dstPort);
            String protocol = resolveProtocol(dstPort);

            graphStateManager.registerNetworkFlowEdge(srcOwner, dstOwner, protocol, targetType);
            log.debug("Network flow edge: {} -> {} (port={}, protocol={})", srcOwner, dstOwner, dstPort, protocol);
            count++;
        }
        return count;
    }

    private NodeType resolveTargetType(int port) {
        if (port == POSTGRES_PORT) {
            return NodeType.DATABASE;
        }
        return NodeType.SERVICE;
    }

    private String resolveProtocol(int port) {
        if (port == POSTGRES_PORT) {
            return "postgresql";
        }
        if (APPLICATION_PORTS.contains(port)) {
            return "HTTP";
        }
        return "TCP";
    }

    private int parsePort(String portStr) {
        if (portStr == null)
            return 0;
        try {
            return Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private List<Map<String, Object>> extractDataPoints(Map<String, Object> metric) {
        // OTLP metrics can have sum, gauge, or histogram containers
        Map<String, Object> sum = getMap(metric, "sum");
        if (sum != null) {
            return getList(sum, "dataPoints");
        }
        Map<String, Object> gauge = getMap(metric, "gauge");
        if (gauge != null) {
            return getList(gauge, "dataPoints");
        }
        Map<String, Object> histogram = getMap(metric, "histogram");
        if (histogram != null) {
            return getList(histogram, "dataPoints");
        }
        return List.of();
    }

    private Map<String, String> extractAttributes(List<Map<String, Object>> attrList) {
        Map<String, String> result = new java.util.HashMap<>();
        for (Map<String, Object> attr : attrList) {
            String key = getString(attr, "key");
            if (key == null)
                continue;
            Object value = attr.get("value");
            if (value instanceof Map<?, ?> valueMap) {
                String strVal = extractStringValue(valueMap);
                if (strVal != null) {
                    result.put(key, strVal);
                }
            }
        }
        return result;
    }

    private String extractStringValue(Map<?, ?> valueMap) {
        Object sv = valueMap.get("stringValue");
        if (sv != null)
            return sv.toString();
        Object iv = valueMap.get("intValue");
        if (iv != null)
            return iv.toString();
        Object dv = valueMap.get("doubleValue");
        if (dv != null)
            return dv.toString();
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getList(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof List<?>) {
            return (List<Map<String, Object>>) val;
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getMap(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof Map<?, ?>) {
            return (Map<String, Object>) val;
        }
        return null;
    }

    private String getString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : null;
    }
}
