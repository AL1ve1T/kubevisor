package com.kubeflow.support;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configuration properties for the kubeflow backend.
 */
@Component
@ConfigurationProperties(prefix = "kubeflow")
public class KubeflowProperties {

    private long staleThresholdSeconds = 120;
    private long cleanupIntervalSeconds = 30;
    private long retentionHours = 24;

    public long getStaleThresholdSeconds() {
        return staleThresholdSeconds;
    }

    public void setStaleThresholdSeconds(long staleThresholdSeconds) {
        this.staleThresholdSeconds = staleThresholdSeconds;
    }

    public long getCleanupIntervalSeconds() {
        return cleanupIntervalSeconds;
    }

    public void setCleanupIntervalSeconds(long cleanupIntervalSeconds) {
        this.cleanupIntervalSeconds = cleanupIntervalSeconds;
    }

    public long getRetentionHours() {
        return retentionHours;
    }

    public void setRetentionHours(long retentionHours) {
        this.retentionHours = retentionHours;
    }
}
