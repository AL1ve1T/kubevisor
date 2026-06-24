package com.kubeflow.api;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.InteractionEvent;
import com.kubeflow.model.NodeType;
import com.kubeflow.persistence.SnapshotPersistenceService;
import com.kubeflow.support.KubeflowProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class GraphUpdatePublisherTest {

    @Mock
    private SnapshotPersistenceService snapshotPersistenceService;

    @Test
    void notifyIfChanged_broadcastsWithoutPersistingHistory() {
        GraphStateManager manager = new GraphStateManager(new KubeflowProperties());
        GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager, snapshotPersistenceService);

        manager.applyEvent(new InteractionEvent(
                "t1", "s1", "svc-a", "ns", "svc-b", "ns",
                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));

        publisher.notifyIfChanged();

        verify(snapshotPersistenceService, never()).save(any());
    }

    @Test
    void persistCurrentSnapshots_savesCurrentGraphEvenWhenNoNewMutationOccurred() {
        GraphStateManager manager = new GraphStateManager(new KubeflowProperties());
        GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager, snapshotPersistenceService);

        manager.applyEvent(new InteractionEvent(
                "t1", "s1", "svc-a", "ns", "svc-b", "ns",
                NodeType.SERVICE, "HTTP", 10.0, false, Instant.now()));

        publisher.notifyIfChanged();
        publisher.persistCurrentSnapshots();

        verify(snapshotPersistenceService, times(1)).save(any());
    }

    @Test
    void persistCurrentSnapshots_skipsEmptyGraph() {
        GraphStateManager manager = new GraphStateManager(new KubeflowProperties());
        GraphUpdatePublisher publisher = new GraphUpdatePublisher(manager, snapshotPersistenceService);

        publisher.persistCurrentSnapshots();

        verify(snapshotPersistenceService, never()).save(any());
    }
}