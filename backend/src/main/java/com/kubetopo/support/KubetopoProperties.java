package com.kubetopo.support;

import com.kubetopo.model.Edge;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configuration properties for the kubetopo backend.
 */
@Component
@ConfigurationProperties(prefix = "kubetopo")
public class KubetopoProperties {

    private long staleThresholdSeconds = 120;
    private long cleanupIntervalSeconds = 30;
    private int retentionDays = 30;

    // CPU utilization thresholds (0.0 – 1.0) for node load classification
    private double cpuElevatedThreshold = 0.50;
    private double cpuHighThreshold = 0.70;
    private double cpuCriticalThreshold = 0.85;

    // Memory utilization thresholds (0.0 – 1.0) for node load classification
    private double memElevatedThreshold = 0.60;
    private double memHighThreshold = 0.75;
    private double memCriticalThreshold = 0.90;

    // Memory limit per container used to convert raw working_set bytes to a [0,1]
    // utilization ratio.
    // Kubeletstats on Minikube does not emit
    // k8s.container.memory_limit_utilization, so the backend
    // divides container.memory.working_set by this value. Defaults to 512 MiB.
    private long memoryLimitBytes = 512L * 1024 * 1024;

    // How often to scrape pod status from the Kubernetes API (in seconds).
    private int podStatusScrapeIntervalSeconds = 5;

    // How often to persist graph snapshots for history replay (in milliseconds).
    private long snapshotPersistIntervalMillis = 1000;

    // How long resource metrics remain valid without a fresh kubeletstats sample.
    // The kubeletstats receiver scrapes every ~15s, so this must comfortably
    // exceed that interval (with margin for a late/skipped scrape) or CPU/RAM
    // momentarily drop to zero between samples.
    private long resourceMetricStaleSeconds = 45;

    // How long an edge keeps reporting its last per-second value after the newest
    // observed traffic, before it decays to zero. Must exceed the telemetry export
    // interval (demo SDK batch + collector flush) so steady traffic does not
    // flicker between batches; lower it to make load fade out sooner after a test
    // stops (at the risk of flicker if it drops below the export interval).
    private long trafficHoldSeconds = Edge.DEFAULT_TRAFFIC_HOLD_SECONDS;

    // OTLP/HTTP ingestion listener settings.
    private final Otlp otlp = new Otlp();

    /**
     * OTLP/HTTP ingestion settings. Exposing ingestion on the conventional
     * OTLP/HTTP port (4318) — separate from the graph API / management port —
     * lets any OpenTelemetry Collector export to the backend with its standard
     * configuration, instead of being wired to the application port.
     */
    public static class Otlp {

        // Dedicated port for the OTLP/HTTP ingestion endpoints (/v1/traces,
        // /v1/metrics). 4318 is the OTLP/HTTP standard port. Set to 0 (or the
        // same value as server.port) to serve ingestion on the main port only.
        private int httpPort = 4318;

        public int getHttpPort() {
            return httpPort;
        }

        public void setHttpPort(int httpPort) {
            this.httpPort = httpPort;
        }
    }

    public Otlp getOtlp() {
        return otlp;
    }

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

    public int getRetentionDays() {
        return retentionDays;
    }

    public void setRetentionDays(int retentionDays) {
        this.retentionDays = retentionDays;
    }

    public double getCpuElevatedThreshold() {
        return cpuElevatedThreshold;
    }

    public void setCpuElevatedThreshold(double v) {
        this.cpuElevatedThreshold = v;
    }

    public double getCpuHighThreshold() {
        return cpuHighThreshold;
    }

    public void setCpuHighThreshold(double v) {
        this.cpuHighThreshold = v;
    }

    public double getCpuCriticalThreshold() {
        return cpuCriticalThreshold;
    }

    public void setCpuCriticalThreshold(double v) {
        this.cpuCriticalThreshold = v;
    }

    public double getMemElevatedThreshold() {
        return memElevatedThreshold;
    }

    public void setMemElevatedThreshold(double v) {
        this.memElevatedThreshold = v;
    }

    public double getMemHighThreshold() {
        return memHighThreshold;
    }

    public void setMemHighThreshold(double v) {
        this.memHighThreshold = v;
    }

    public double getMemCriticalThreshold() {
        return memCriticalThreshold;
    }

    public void setMemCriticalThreshold(double v) {
        this.memCriticalThreshold = v;
    }

    public long getMemoryLimitBytes() {
        return memoryLimitBytes;
    }

    public void setMemoryLimitBytes(long memoryLimitBytes) {
        this.memoryLimitBytes = memoryLimitBytes;
    }

    public int getPodStatusScrapeIntervalSeconds() {
        return podStatusScrapeIntervalSeconds;
    }

    public void setPodStatusScrapeIntervalSeconds(int podStatusScrapeIntervalSeconds) {
        this.podStatusScrapeIntervalSeconds = podStatusScrapeIntervalSeconds;
    }

    public long getSnapshotPersistIntervalMillis() {
        return snapshotPersistIntervalMillis;
    }

    public void setSnapshotPersistIntervalMillis(long snapshotPersistIntervalMillis) {
        this.snapshotPersistIntervalMillis = snapshotPersistIntervalMillis;
    }

    public long getResourceMetricStaleSeconds() {
        return resourceMetricStaleSeconds;
    }

    public void setResourceMetricStaleSeconds(long resourceMetricStaleSeconds) {
        this.resourceMetricStaleSeconds = resourceMetricStaleSeconds;
    }

    public long getTrafficHoldSeconds() {
        return trafficHoldSeconds;
    }

    public void setTrafficHoldSeconds(long trafficHoldSeconds) {
        this.trafficHoldSeconds = trafficHoldSeconds;
    }
}
