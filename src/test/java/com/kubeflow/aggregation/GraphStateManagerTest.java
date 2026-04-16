package com.kubeflow.aggregation;

import com.kubeflow.model.GraphSnapshot;
import com.kubeflow.model.InteractionEvent;
import com.kubeflow.model.NodeType;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class GraphStateManagerTest {

    private final GraphStateManager manager = new GraphStateManager();

    @Test
    void registerNode_createsNodeWithoutEdge() {
        manager.registerNode("auth-service", "default");

        assertEquals(1, manager.getNodes().size());
        assertTrue(manager.getNodes().containsKey("auth-service"));
        assertTrue(manager.getEdges().isEmpty());
    }

    @Test
    void registerNode_ignoresBlankServiceName() {
        manager.registerNode(" ", "default");
        manager.registerNode(null, "default");

        assertTrue(manager.getNodes().isEmpty());
        assertTrue(manager.getEdges().isEmpty());
    }

    @Test
    void registerEdge_createsSkeleton_withoutMetrics() {
        InteractionEvent event = new InteractionEvent(
                "t1", "s1",
                "order-service", "demo",
                "ticket-service", "demo",
                NodeType.SERVICE, "HTTP",
                45.0, false, Instant.now());

        manager.registerEdge(event);

        assertEquals(2, manager.getNodes().size());
        assertEquals(1, manager.getEdges().size());
        var edge = manager.getEdges().get("order-service->ticket-service");
        assertEquals(0, edge.getRequestCount());
    }

    @Test
    void recordTraffic_fillsMetricsOnExistingEdge() {
        InteractionEvent event = new InteractionEvent(
                "t1", "s1",
                "order-service", "demo",
                "ticket-service", "demo",
                NodeType.SERVICE, "HTTP",
                45.0, false, Instant.now());

        manager.registerEdge(event);
        manager.recordTraffic(event);

        var edge = manager.getEdges().get("order-service->ticket-service");
        assertEquals(1, edge.getRequestCount());
        assertEquals(45.0, edge.getAverageLatencyMs(), 0.001);
    }

    @Test
    void applyEvent_createsNodesAndEdge() {
        InteractionEvent event = new InteractionEvent(
                "t1", "s1",
                "order-service", "demo",
                "ticket-service", "demo",
                NodeType.SERVICE, "HTTP",
                45.0, false, Instant.now());

        manager.applyEvent(event);

        assertEquals(2, manager.getNodes().size());
        assertEquals(1, manager.getEdges().size());
        assertTrue(manager.getNodes().containsKey("order-service"));
        assertTrue(manager.getNodes().containsKey("ticket-service"));
        assertEquals(1, manager.getEdges().get("order-service->ticket-service").getRequestCount());
    }

    @Test
    void applyEvent_multipleEvents_aggregatesMetrics() {
        InteractionEvent event1 = new InteractionEvent(
                "t1", "s1", "svc-a", "ns", "svc-b", "ns",
                NodeType.SERVICE, "HTTP", 50.0, false, Instant.now());
        InteractionEvent event2 = new InteractionEvent(
                "t2", "s2", "svc-a", "ns", "svc-b", "ns",
                NodeType.SERVICE, "HTTP", 100.0, true, Instant.now());

        manager.applyEvent(event1);
        manager.applyEvent(event2);

        var edge = manager.getEdges().get("svc-a->svc-b");
        assertEquals(2, edge.getRequestCount());
        assertEquals(1, edge.getErrorCount());
        assertEquals(75.0, edge.getAverageLatencyMs(), 0.001);
        assertEquals(0.5, edge.getErrorRate(), 0.001);
    }

    @Test
    void buildSnapshot_returnsCorrectDtos() {
        InteractionEvent event = new InteractionEvent(
                "t1", "s1", "auth", "demo", "userdb", "demo",
                NodeType.DATABASE, "postgresql", 10.0, false, Instant.now());

        manager.applyEvent(event);
        GraphSnapshot snapshot = manager.buildSnapshot();

        assertEquals(2, snapshot.nodes().size());
        assertEquals(1, snapshot.edges().size());
        assertNotNull(snapshot.generatedAt());
    }

    @Test
    void removeNode_removesNodeAndAssociatedEdges() {
        manager.applyEvent(new InteractionEvent(
                "t1", "s1", "a", "ns", "b", "ns",
                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));

        manager.removeNode("a");

        assertFalse(manager.getNodes().containsKey("a"));
        assertTrue(manager.getEdges().isEmpty());
    }
}
