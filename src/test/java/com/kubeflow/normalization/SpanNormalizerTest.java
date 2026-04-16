package com.kubeflow.normalization;

import com.kubeflow.model.InteractionEvent;
import com.kubeflow.model.NodeType;
import com.kubeflow.parsing.ParsedSpan;
import com.kubeflow.topology.PodIpResolver;
import com.kubeflow.topology.TopologyResolver;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SpanNormalizerTest {

    private final TopologyResolver topologyResolver = new TopologyResolver();
    private final PodIpResolver podIpResolver = new PodIpResolver();
    private final SpanNormalizer normalizer = new SpanNormalizer(topologyResolver, podIpResolver);

    @Test
    void normalize_clientSpanWithPeerService_producesInteractionEvent() {
        ParsedSpan span = new ParsedSpan(
                "trace1", "span1", "parent1",
                "order-service", "demo",
                "GET /tickets", "3",
                1_000_000_000L, 1_050_000_000L,
                0,
                Map.of("peer.service", "ticket-service", "http.method", "GET"),
                Map.of());

        InteractionEvent event = normalizer.normalize(span);

        assertNotNull(event);
        assertEquals("order-service", event.sourceService());
        assertEquals("ticket-service", event.targetService());
        assertEquals(NodeType.SERVICE, event.targetType());
        assertEquals("HTTP", event.protocol());
        assertEquals(50.0, event.latencyMs(), 0.001);
        assertFalse(event.isError());
    }

    @Test
    void normalize_clientSpanWithDatabase_producesDbEvent() {
        ParsedSpan span = new ParsedSpan(
                "trace2", "span2", "parent2",
                "auth-service", "demo",
                "SELECT users", "3",
                1_000_000_000L, 1_020_000_000L,
                0,
                Map.of("db.system", "postgresql", "db.name", "authdb"),
                Map.of());

        InteractionEvent event = normalizer.normalize(span);

        assertNotNull(event);
        assertEquals("auth-service", event.sourceService());
        assertEquals("authdb", event.targetService());
        assertEquals(NodeType.DATABASE, event.targetType());
        assertEquals("postgresql", event.protocol());
    }

    @Test
    void normalize_serverSpanWithoutCallerInfo_returnsNull() {
        ParsedSpan span = new ParsedSpan(
                "trace3", "span3", "parent3",
                "ticket-service", "demo",
                "GET /tickets", "2",
                1_000_000_000L, 1_030_000_000L,
                0,
                Map.of("http.method", "GET"),
                Map.of());

        InteractionEvent event = normalizer.normalize(span);
        assertNull(event);
    }

    @Test
    void normalize_serverSpanWithClientAddress_resolvesCallerViaIp() {
        podIpResolver.register("10.244.0.14", "order-service");

        ParsedSpan span = new ParsedSpan(
                "trace3b", "span3b", "parent3b",
                "ticket-service", "demo",
                "GET /tickets", "2",
                1_000_000_000L, 1_030_000_000L,
                0,
                Map.of("http.method", "GET", "client.address", "10.244.0.14"),
                Map.of());

        InteractionEvent event = normalizer.normalize(span);
        assertNotNull(event);
        assertEquals("order-service", event.sourceService());
        assertEquals("ticket-service", event.targetService());
    }

    @Test
    void normalize_serverSpanWithUnknownClientAddress_returnsNull() {
        ParsedSpan span = new ParsedSpan(
                "trace3c", "span3c", "parent3c",
                "ticket-service", "demo",
                "GET /tickets", "2",
                1_000_000_000L, 1_030_000_000L,
                0,
                Map.of("http.method", "GET", "client.address", "10.244.0.99"),
                Map.of());

        InteractionEvent event = normalizer.normalize(span);
        assertNull(event);
    }

    @Test
    void normalize_errorSpan_setsIsErrorTrue() {
        ParsedSpan span = new ParsedSpan(
                "trace4", "span4", "parent4",
                "order-service", "demo",
                "POST /orders", "3",
                1_000_000_000L, 1_100_000_000L,
                2,
                Map.of("peer.service", "payment-service", "http.method", "POST"),
                Map.of());

        InteractionEvent event = normalizer.normalize(span);

        assertNotNull(event);
        assertTrue(event.isError());
        assertEquals(100.0, event.latencyMs(), 0.001);
    }
}
