package com.kubeflow.aggregation;

import com.kubeflow.api.GraphUpdatePublisher;
import com.kubeflow.model.GraphSnapshot;
import com.kubeflow.persistence.SnapshotPersistenceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Emits the current cluster state once every second to all connected SSE
 * clients
 * and persists each snapshot to the database.
 */
@Component
public class ScheduledSnapshotEmitter {

    private static final Logger log = LoggerFactory.getLogger(ScheduledSnapshotEmitter.class);

    private final GraphStateManager graphStateManager;
    private final GraphUpdatePublisher graphUpdatePublisher;
    private final SnapshotPersistenceService snapshotPersistenceService;

    public ScheduledSnapshotEmitter(GraphStateManager graphStateManager,
            GraphUpdatePublisher graphUpdatePublisher,
            SnapshotPersistenceService snapshotPersistenceService) {
        this.graphStateManager = graphStateManager;
        this.graphUpdatePublisher = graphUpdatePublisher;
        this.snapshotPersistenceService = snapshotPersistenceService;
    }

    @Scheduled(fixedRate = 1000)
    public void emitSnapshot() {
        GraphSnapshot snapshot = graphStateManager.buildSnapshot();

        graphUpdatePublisher.publishUpdate(snapshot);
        snapshotPersistenceService.save(snapshot);

        log.trace("Emitted snapshot: {} nodes, {} edges",
                snapshot.nodes().size(), snapshot.edges().size());
    }
}
