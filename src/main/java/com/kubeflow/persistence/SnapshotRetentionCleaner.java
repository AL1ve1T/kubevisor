package com.kubeflow.persistence;

import com.kubeflow.support.KubeflowProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Periodically purges graph snapshots older than the configured retention
 * window.
 */
@Component
public class SnapshotRetentionCleaner {

    private static final Logger log = LoggerFactory.getLogger(SnapshotRetentionCleaner.class);

    private final SnapshotPersistenceService snapshotPersistenceService;
    private final KubeflowProperties properties;

    public SnapshotRetentionCleaner(SnapshotPersistenceService snapshotPersistenceService,
            KubeflowProperties properties) {
        this.snapshotPersistenceService = snapshotPersistenceService;
        this.properties = properties;
    }

    @Scheduled(fixedRate = 3600_000) // every hour
    public void purgeExpiredSnapshots() {
        Duration retention = Duration.ofHours(properties.getRetentionHours());
        snapshotPersistenceService.purgeOlderThan(retention);
    }
}
