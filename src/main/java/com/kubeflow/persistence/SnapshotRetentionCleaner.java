package com.kubeflow.persistence;

import com.kubeflow.support.KubeflowProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Periodically purges graph snapshots older than the configured retention
 * window.
 */
@Component
public class SnapshotRetentionCleaner {

    private final SnapshotPersistenceService snapshotPersistenceService;
    private final KubeflowProperties properties;

    public SnapshotRetentionCleaner(SnapshotPersistenceService snapshotPersistenceService,
            KubeflowProperties properties) {
        this.snapshotPersistenceService = snapshotPersistenceService;
        this.properties = properties;
    }

    @Scheduled(fixedRate = 3600_000) // every hour
    public void purgeExpiredSnapshots() {
        Duration retention = Duration.ofDays(properties.getRetentionDays());
        snapshotPersistenceService.purgeOlderThan(retention);
    }
}
