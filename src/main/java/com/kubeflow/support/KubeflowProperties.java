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

    // Kubernetes API URL for pod status scraping.
    // Empty string = auto-detect (in-cluster SA, or http://localhost:8001 for local dev).
    private String k8sApiUrl = "";

    // How often to scrape pod status from the Kubernetes API (in seconds).
    private int podStatusScrapeIntervalSeconds = 15;

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

    public String getK8sApiUrl() {
        return k8sApiUrl;
    }

    public void setK8sApiUrl(String k8sApiUrl) {
        this.k8sApiUrl = k8sApiUrl;
    }

    public int getPodStatusScrapeIntervalSeconds() {
        return podStatusScrapeIntervalSeconds;
    }

    public void setPodStatusScrapeIntervalSeconds(int podStatusScrapeIntervalSeconds) {
        this.podStatusScrapeIntervalSeconds = podStatusScrapeIntervalSeconds;
    }
}
