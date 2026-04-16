package com.kubeflow.ingestion;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.NodeType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class NetworkFlowProcessorTest {

    private final GraphStateManager graphStateManager = new GraphStateManager();
    private final NetworkFlowProcessor processor = new NetworkFlowProcessor(graphStateManager);

    @Test
    void processMetrics_withHttpFlow_createsServiceEdge() {
        Map<String, Object> payload = buildPayload(
                "order-service", "default",
                "auth-service", "default",
                "8081");

        processor.processMetrics(payload);

        assertEquals(2, graphStateManager.getNodes().size());
        assertEquals(1, graphStateManager.getEdges().size());
        assertNotNull(graphStateManager.getEdges().get("order-service->auth-service"));
        assertEquals("HTTP", graphStateManager.getEdges().get("order-service->auth-service").getProtocol());
    }

    @Test
    void processMetrics_withPostgresFlow_createsDatabaseEdge() {
        Map<String, Object> payload = buildPayload(
                "ticket-service", "default",
                "postgres", "default",
                "5432");

        processor.processMetrics(payload);

        assertEquals(2, graphStateManager.getNodes().size());
        var edge = graphStateManager.getEdges().get("ticket-service->postgres");
        assertNotNull(edge);
        assertEquals("postgresql", edge.getProtocol());
        assertEquals(NodeType.DATABASE, graphStateManager.getNodes().get("postgres").getType());
    }

    @Test
    void processMetrics_skipsSelfReferencing() {
        Map<String, Object> payload = buildPayload(
                "order-service", "default",
                "order-service", "default",
                "8082");

        processor.processMetrics(payload);

        assertTrue(graphStateManager.getEdges().isEmpty());
    }

    @Test
    void processMetrics_skipsNonDefaultNamespace() {
        Map<String, Object> payload = buildPayload(
                "order-service", "default",
                "kube-dns", "kube-system",
                "53");

        processor.processMetrics(payload);

        assertTrue(graphStateManager.getEdges().isEmpty());
    }

    @Test
    void processMetrics_skipsMissingSrcOwner() {
        Map<String, Object> payload = buildPayloadWithAttrs(List.of(
                attr("k8s.dst.owner.name", "auth-service"),
                attr("k8s.src.namespace", "default"),
                attr("k8s.dst.namespace", "default"),
                attr("dst.port", "8081")));

        processor.processMetrics(payload);

        assertTrue(graphStateManager.getEdges().isEmpty());
    }

    @Test
    void processMetrics_skipsEmptyOwnerName() {
        Map<String, Object> payload = buildPayload(
                "", "default",
                "auth-service", "default",
                "8081");

        processor.processMetrics(payload);

        assertTrue(graphStateManager.getEdges().isEmpty());
    }

    @Test
    void processMetrics_multipleFlows_createsMultipleEdges() {
        Map<String, Object> payload = buildMultiFlowPayload(
                List.of(
                        flowAttrs("order-service", "default", "auth-service", "default", "8081"),
                        flowAttrs("order-service", "default", "ticket-service", "default", "8083"),
                        flowAttrs("ticket-service", "default", "postgres", "default", "5432")));

        processor.processMetrics(payload);

        assertEquals(4, graphStateManager.getNodes().size());
        assertEquals(3, graphStateManager.getEdges().size());
        assertNotNull(graphStateManager.getEdges().get("order-service->auth-service"));
        assertNotNull(graphStateManager.getEdges().get("order-service->ticket-service"));
        assertNotNull(graphStateManager.getEdges().get("ticket-service->postgres"));
    }

    @Test
    void processMetrics_unknownPort_isFiltered() {
        Map<String, Object> payload = buildPayload(
                "service-a", "default",
                "service-b", "default",
                "9090");

        processor.processMetrics(payload);

        assertTrue(graphStateManager.getEdges().isEmpty());
    }

    @Test
    void processMetrics_ignoresNonNetworkFlowMetrics() {
        Map<String, Object> payload = Map.of(
                "resourceMetrics", List.of(Map.of(
                        "scopeMetrics", List.of(Map.of(
                                "metrics", List.of(Map.of(
                                        "name", "http.server.duration",
                                        "sum", Map.of(
                                                "dataPoints", List.of(Map.of(
                                                        "attributes", List.of(),
                                                        "asInt", "100"))))))))));

        processor.processMetrics(payload);

        assertTrue(graphStateManager.getEdges().isEmpty());
    }

    // --- helpers ---

    private Map<String, Object> buildPayload(String srcOwner, String srcNs,
            String dstOwner, String dstNs, String dstPort) {
        return buildPayloadWithAttrs(List.of(
                attr("k8s.src.owner.name", srcOwner),
                attr("k8s.src.namespace", srcNs),
                attr("k8s.dst.owner.name", dstOwner),
                attr("k8s.dst.namespace", dstNs),
                attr("dst.port", dstPort)));
    }

    private Map<String, Object> buildPayloadWithAttrs(List<Map<String, Object>> attrs) {
        return Map.of(
                "resourceMetrics", List.of(Map.of(
                        "scopeMetrics", List.of(Map.of(
                                "metrics", List.of(Map.of(
                                        "name", "beyla.network.flow.bytes",
                                        "sum", Map.of(
                                                "dataPoints", List.of(Map.of(
                                                        "attributes", attrs,
                                                        "asInt", "12345"))))))))));
    }

    private Map<String, Object> buildMultiFlowPayload(List<List<Map<String, Object>>> flowAttrsList) {
        List<Map<String, Object>> dataPoints = flowAttrsList.stream()
                .map(attrs -> Map.<String, Object>of("attributes", attrs, "asInt", "100"))
                .toList();

        return Map.of(
                "resourceMetrics", List.of(Map.of(
                        "scopeMetrics", List.of(Map.of(
                                "metrics", List.of(Map.of(
                                        "name", "beyla.network.flow.bytes",
                                        "sum", Map.of("dataPoints", dataPoints))))))));
    }

    private List<Map<String, Object>> flowAttrs(String srcOwner, String srcNs,
            String dstOwner, String dstNs, String dstPort) {
        return List.of(
                attr("k8s.src.owner.name", srcOwner),
                attr("k8s.src.namespace", srcNs),
                attr("k8s.dst.owner.name", dstOwner),
                attr("k8s.dst.namespace", dstNs),
                attr("dst.port", dstPort));
    }

    private Map<String, Object> attr(String key, String value) {
        return Map.of("key", key, "value", Map.of("stringValue", value));
    }
}
