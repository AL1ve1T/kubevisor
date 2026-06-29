package com.kubevisor.persistence;

import com.kubevisor.support.KubevisorProperties;
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
    private final KubevisorProperties properties;

    public SnapshotRetentionCleaner(SnapshotPersistenceService snapshotPersistenceService,
            KubevisorProperties properties) {
        this.snapshotPersistenceService = snapshotPersistenceService;
        this.properties = properties;
    }

    @Scheduled(fixedRate = 3600_000) // every hour
    public void purgeExpiredSnapshots() {
        Duration retention = Duration.ofDays(properties.getRetentionDays());
        snapshotPersistenceService.purgeOlderThan(retention);
    }
}
