package com.kubeflow.cleanup;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.api.GraphUpdatePublisher;
import com.kubeflow.model.InteractionEvent;
import com.kubeflow.model.NodeType;
import com.kubeflow.persistence.SnapshotPersistenceService;
import com.kubeflow.support.KubeflowProperties;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class StaleGraphCleanerTest {

        @Test
        void cleanStaleElements_removesExpiredNodesAndEdges() throws Exception {
                GraphStateManager manager = new GraphStateManager(new KubeflowProperties());

                KubeflowProperties properties = new KubeflowProperties();
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
                GraphStateManager manager = new GraphStateManager(new KubeflowProperties());

                KubeflowProperties properties = new KubeflowProperties();
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
}
