package com.kubevisor.aggregation;

import com.kubevisor.model.GraphSnapshot;
import com.kubevisor.model.InteractionEvent;
import com.kubevisor.model.LoadLevel;
import com.kubevisor.model.NodeType;
import com.kubevisor.model.PodPhase;
import com.kubevisor.support.KubevisorProperties;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GraphStateManagerTest {

        private final GraphStateManager manager = new GraphStateManager(new KubevisorProperties());

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
                assertNotNull(edge);
        }

        @Test
        void recordTraffic_fillsMetricsOnExistingEdge() {
                InteractionEvent event = new InteractionEvent(
                                "t1", "s1",
                                "order-service", "demo",
                                "ticket-service", "demo",
                                NodeType.SERVICE, "HTTP",
                                45.0, false, Instant.ofEpochSecond(1000));
                InteractionEvent later = new InteractionEvent(
                                "t2", "s2",
                                "order-service", "demo",
                                "ticket-service", "demo",
                                NodeType.SERVICE, "HTTP",
                                90.0, false, Instant.ofEpochSecond(1001));

                manager.registerEdge(event);
                manager.recordTraffic(event);
                manager.recordTraffic(later); // completes event-second 1000

                var edge = manager.getEdges().get("order-service->ticket-service");
                // Reported metric is the completed second 1000 (the 45ms request).
                assertEquals(45.0, edge.getAverageLatencyMs(Instant.ofEpochSecond(1001)), 0.001);
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
                assertNotNull(manager.getEdges().get("order-service->ticket-service"));
        }

        @Test
        void applyEvent_multipleEvents_aggregatesMetrics() {
                InteractionEvent event1 = new InteractionEvent(
                                "t1", "s1", "svc-a", "ns", "svc-b", "ns",
                                NodeType.SERVICE, "HTTP", 50.0, false, Instant.ofEpochSecond(1000));
                InteractionEvent event2 = new InteractionEvent(
                                "t2", "s2", "svc-a", "ns", "svc-b", "ns",
                                NodeType.SERVICE, "HTTP", 100.0, true, Instant.ofEpochSecond(1000));
                InteractionEvent later = new InteractionEvent(
                                "t3", "s3", "svc-a", "ns", "svc-b", "ns",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.ofEpochSecond(1001));

                manager.applyEvent(event1);
                manager.applyEvent(event2);
                manager.applyEvent(later); // completes event-second 1000

                var edge = manager.getEdges().get("svc-a->svc-b");
                // Completed second 1000 aggregates event1 + event2.
                Instant read = Instant.ofEpochSecond(1001);
                assertEquals(1, edge.getErrorCount());
                assertEquals(75.0, edge.getAverageLatencyMs(read), 0.001);
                assertEquals(0.5, edge.getErrorRate(read), 0.001);
        }

        @Test
        void registerNetworkFlowEdge_doesNotCountByteSamplesAsRequests() {
                manager.registerNetworkFlowEdge("svc-a", "ns", "svc-b", "ns", "HTTP", NodeType.SERVICE,
                                NodeType.SERVICE);

                var edge = manager.getEdges().get("svc-a->svc-b");
                assertNotNull(edge);
                assertEquals(0.0, edge.getRequestsPerSecond(), 0.001);
        }

        @Test
        void buildSnapshots_returnsCorrectDtos() {
                InteractionEvent event = new InteractionEvent(
                                "t1", "s1", "auth", "demo", "userdb", "demo",
                                NodeType.DATABASE, "postgresql", 10.0, false, Instant.now());

                manager.applyEvent(event);
                List<GraphSnapshot> snapshots = manager.buildSnapshots();

                assertEquals(1, snapshots.size());
                GraphSnapshot snapshot = snapshots.get(0);
                assertEquals("demo", snapshot.namespace());
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

        @Test
        void buildSnapshots_keepsRestartStateWhenTrafficHasDecayed() throws Exception {
                manager.applyEvent(new InteractionEvent(
                                "t1", "s1", "auth-service", "default", "order-service", "default",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));
                manager.updateNodePodStatus("auth-service", "default", "auth-service-abc12-pod0", PodPhase.NOT_READY,
                                115, Instant.parse("2026-06-20T23:18:11Z"), "Error");

                // The just-recorded second is still in progress, so per-second traffic
                // reads as zero. Restart state must survive that decay.
                GraphSnapshot snapshot = manager.buildSnapshot("default");
                GraphSnapshot.EdgeDto edge = snapshot.edges().getFirst();
                GraphSnapshot.NodeDto authNode = snapshot.nodes().stream()
                                .filter(node -> node.id().equals("auth-service"))
                                .findFirst()
                                .orElseThrow();

                assertEquals(0.0, edge.requestsPerSecond(), 0.001);
                assertEquals(PodPhase.NOT_READY, authNode.podPhase());
                assertEquals(115, authNode.restartCount());
                assertEquals(Instant.parse("2026-06-20T23:18:11Z"), authNode.lastRestartAt());
        }

        @Test
        void buildSnapshots_zeroesStaleResourceMetricsAndNormalizesEdgeLoad() throws Exception {
                KubevisorProperties properties = new KubevisorProperties();
                properties.setResourceMetricStaleSeconds(1);
                GraphStateManager localManager = new GraphStateManager(properties);

                localManager.applyEvent(new InteractionEvent(
                                "t1", "s1", "gateway", "default", "order-service", "default",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));
                localManager.updateNodeCpuUtilization("order-service", "default", "order-service-abc12-pod0", 0.92);
                localManager.updateNodeMemoryUtilization("order-service", "default", "order-service-abc12-pod0", 0.81);

                ageNodeResourceMetrics(localManager, "order-service", Instant.now().minusSeconds(2));

                GraphSnapshot snapshot = localManager.buildSnapshot("default");
                GraphSnapshot.NodeDto targetNode = snapshot.nodes().stream()
                                .filter(node -> node.id().equals("order-service"))
                                .findFirst()
                                .orElseThrow();
                GraphSnapshot.EdgeDto edge = snapshot.edges().getFirst();

                assertNotNull(targetNode);
                assertEquals(LoadLevel.NORMAL, edge.loadLevel());
        }

        @Test
        void buildSnapshots_exposesPerPodDetailUnderWorkloadNode() {
                manager.applyEvent(new InteractionEvent(
                                "t1", "s1", "gateway", "default", "order-service", "default",
                                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));
                manager.updateNodeCpuUtilization("order-service", "default", "order-service-abc12-rep01", 0.30);
                manager.updateNodeCpuUtilization("order-service", "default", "order-service-abc12-rep02", 0.90);
                manager.updateNodeMemoryUtilization("order-service", "default", "order-service-abc12-rep01", 0.40);

                GraphSnapshot.NodeDto node = manager.buildSnapshot("default").nodes().stream()
                                .filter(n -> n.id().equals("order-service"))
                                .findFirst()
                                .orElseThrow();

                // Edge traffic stays on the workload; per-pod detail hangs underneath it.
                assertEquals(2, node.pods().size());
                GraphSnapshot.PodDto hot = node.pods().stream()
                                .filter(p -> p.podName().equals("order-service-abc12-rep02"))
                                .findFirst().orElseThrow();
                assertEquals(0.90, hot.cpuUtilization(), 0.001);
        }

        @Test
        void pruneStalePods_removesStalePodsAndRefreshesRollup() {
                manager.updateNodeCpuUtilization("order-service", "default", "order-service-abc12-rep01", 0.30);
                manager.updateNodeCpuUtilization("order-service", "default", "order-service-abc12-rep02", 0.90);

                // A cutoff in the past evicts nothing — both replicas survive.
                manager.pruneStalePods(Instant.now().minusSeconds(1000));
                assertEquals(2, manager.getNodes().get("order-service").getPods().size());
                assertEquals(0.90, manager.getNodes().get("order-service").getCpuUtilization(), 0.001);

                // A cutoff in the future evicts every replica and resets the roll-up.
                manager.pruneStalePods(Instant.now().plusSeconds(1000));
                var node = manager.getNodes().get("order-service");
                assertEquals(0, node.getPods().size());
                assertEquals(0.0, node.getCpuUtilization(), 0.001);
        }

        @Test
        void reconcileNamespacePods_dropsVanishedPodsAndRefreshesRollup() {
                manager.updateNodePodStatus("order-service", "default", "order-service-rep01",
                                PodPhase.RUNNING, 0, null, null);
                manager.updateNodePodStatus("order-service", "default", "order-service-rep02",
                                PodPhase.RUNNING, 0, null, null);
                assertEquals(2, manager.getNodes().get("order-service").getPods().size());

                // The authoritative scrape only reports rep01 — rep02 has been deleted.
                manager.reconcileNamespacePods("default", java.util.Set.of("order-service-rep01"));
                assertEquals(1, manager.getNodes().get("order-service").getPods().size());
                assertTrue(manager.getNodes().get("order-service").getPods().containsKey("order-service-rep01"));

                // An empty scrape means the workload has no live pods left → roll-up resets.
                manager.reconcileNamespacePods("default", java.util.Set.of());
                var node = manager.getNodes().get("order-service");
                assertEquals(0, node.getPods().size());
                assertEquals(PodPhase.UNKNOWN, node.getPodPhase());
        }

        @Test
        void reconcileNamespacePods_leavesOtherNamespacesUntouched() {
                manager.updateNodePodStatus("order-service", "default", "order-service-rep01",
                                PodPhase.RUNNING, 0, null, null);
                manager.updateNodePodStatus("billing-service", "payments", "billing-service-rep01",
                                PodPhase.RUNNING, 0, null, null);

                // Reconciling 'default' with an empty list must not affect the 'payments'
                // namespace.
                manager.reconcileNamespacePods("default", java.util.Set.of());
                assertEquals(0, manager.getNodes().get("order-service").getPods().size());
                assertEquals(1, manager.getNodes().get("billing-service").getPods().size());
        }

        private void ageNodeResourceMetrics(GraphStateManager graphStateManager, String nodeId, Instant staleAt)
                        throws Exception {
                var node = graphStateManager.getNodes().get(nodeId);
                Field lastCpuUpdatedAtField = node.getClass().getDeclaredField("lastCpuUpdatedAt");
                lastCpuUpdatedAtField.setAccessible(true);
                lastCpuUpdatedAtField.set(node, staleAt);

                Field lastMemoryUpdatedAtField = node.getClass().getDeclaredField("lastMemoryUpdatedAt");
                lastMemoryUpdatedAtField.setAccessible(true);
                lastMemoryUpdatedAtField.set(node, staleAt);
        }
}
