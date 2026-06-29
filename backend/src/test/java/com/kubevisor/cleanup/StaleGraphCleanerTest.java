package com.kubevisor.cleanup;

import com.kubevisor.aggregation.GraphStateManager;
import com.kubevisor.api.GraphUpdatePublisher;
import com.kubevisor.model.InteractionEvent;
import com.kubevisor.model.NodeType;
import com.kubevisor.persistence.SnapshotPersistenceService;
import com.kubevisor.support.KubevisorProperties;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class StaleGraphCleanerTest {

        @Test
        void cleanStaleElements_removesExpiredNodesAndEdges() throws Exception {
                GraphStateManager manager = new GraphStateManager(new KubevisorProperties());

                KubevisorProperties properties = new KubevisorProperties();
                properties.setStaleThresholdSeconds(1); // 1 second threshold

                GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager,
                                mock(SnapshotPersistenceService.class));
                StaleGraphCleaner cleaner = new StaleGraphCleaner(manager, properties, publisher);

                // Add an event
                manager.applyEvent(new InteractionEvent(
                                "t1", "s1", "old-service", "ns", "old-target", "ns",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));

                assertEquals(2, manager.getNodes().size());
                assertEquals(1, manager.getEdges().size());

                // Wait for elements to become stale
                Thread.sleep(1500);

                cleaner.cleanStaleElements();

                assertTrue(manager.getNodes().isEmpty());
                assertTrue(manager.getEdges().isEmpty());
        }

        @Test
        void cleanStaleElements_keepsRecentElements() {
                GraphStateManager manager = new GraphStateManager(new KubevisorProperties());

                KubevisorProperties properties = new KubevisorProperties();
                properties.setStaleThresholdSeconds(120);

                GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager,
                                mock(SnapshotPersistenceService.class));
                StaleGraphCleaner cleaner = new StaleGraphCleaner(manager, properties, publisher);

                manager.applyEvent(new InteractionEvent(
                                "t1", "s1", "fresh-service", "ns", "fresh-target", "ns",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));

                cleaner.cleanStaleElements();

                assertEquals(2, manager.getNodes().size());
                assertEquals(1, manager.getEdges().size());
        }

        @Test
        void cleanStaleElements_removesEdgeByLastTrafficAt_evenWhenBeylaKeepsTouchingIt() throws Exception {
                GraphStateManager manager = new GraphStateManager(new KubevisorProperties());

                KubevisorProperties properties = new KubevisorProperties();
                properties.setStaleThresholdSeconds(1);

                GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager,
                                mock(SnapshotPersistenceService.class));
                StaleGraphCleaner cleaner = new StaleGraphCleaner(manager, properties, publisher);

                // Edge is created with HTTP traffic (sets lastTrafficAt)
                manager.applyEvent(new InteractionEvent(
                                "t1", "s1", "svc-a", "ns", "svc-b", "ns",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));

                // Wait for traffic to become stale
                Thread.sleep(1500);

                // Simulate Beyla refreshing lastSeenAt (touch) without adding new request
                // traffic
                manager.registerNetworkFlowEdge("svc-a", "ns", "svc-b", "ns", "HTTP",
                                NodeType.SERVICE, NodeType.SERVICE);

                // Edge's lastSeenAt is now fresh, but lastTrafficAt is still stale
                cleaner.cleanStaleElements();

                // Edge must be removed — Beyla touch must not prevent cleanup
                assertTrue(manager.getEdges().isEmpty());
        }

        @Test
        void cleanStaleElements_keepsTopologyOnlyEdgeWhileBeylaStillReporting() throws Exception {
                GraphStateManager manager = new GraphStateManager(new KubevisorProperties());

                KubevisorProperties properties = new KubevisorProperties();
                properties.setStaleThresholdSeconds(1);

                GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager,
                                mock(SnapshotPersistenceService.class));
                StaleGraphCleaner cleaner = new StaleGraphCleaner(manager, properties, publisher);

                // Edge created by Beyla only — no request traffic, lastTrafficAt is null
                manager.registerNetworkFlowEdge("svc-a", "ns", "svc-b", "ns", "HTTP",
                                NodeType.SERVICE, NodeType.SERVICE);

                Thread.sleep(1500);

                // Beyla reports again before cleanup — refreshes lastSeenAt
                manager.registerNetworkFlowEdge("svc-a", "ns", "svc-b", "ns", "HTTP",
                                NodeType.SERVICE, NodeType.SERVICE);

                cleaner.cleanStaleElements();

                // Edge must stay — Beyla is still actively reporting this flow
                assertFalse(manager.getEdges().isEmpty());
        }
}
