package com.kubeflow.model;

import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.DoubleAdder;

/**
 * Represents a directed edge between two nodes in the topology graph.
 * Contains aggregated rolling metrics for the communication link.
 */
public class Edge {

    private final String id;
    private final String sourceNodeId;
    private final String targetNodeId;
    private String protocol;
    private Instant lastSeenAt;

    // Rolling metrics
    private final AtomicLong requestCount = new AtomicLong(0);
    private final AtomicLong errorCount = new AtomicLong(0);
    private final DoubleAdder totalLatencyMs = new DoubleAdder();
    private volatile double maxLatencyMs = 0;

    // Sliding window tracking
    private volatile long windowStartEpochMs;
    private final AtomicLong windowRequestCount = new AtomicLong(0);

    public Edge(String sourceNodeId, String targetNodeId, String protocol) {
        this.id = sourceNodeId + "->" + targetNodeId;
        this.sourceNodeId = Objects.requireNonNull(sourceNodeId);
        this.targetNodeId = Objects.requireNonNull(targetNodeId);
        this.protocol = protocol;
        this.lastSeenAt = Instant.now();
        this.windowStartEpochMs = System.currentTimeMillis();
    }

    public String getId() {
        return id;
    }

    public String getSourceNodeId() {
        return sourceNodeId;
    }

    public String getTargetNodeId() {
        return targetNodeId;
    }

    public String getProtocol() {
        return protocol;
    }

    public void setProtocol(String protocol) {
        this.protocol = protocol;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public long getRequestCount() {
        return requestCount.get();
    }

    public long getErrorCount() {
        return errorCount.get();
    }

    public double getTotalLatencyMs() {
        return totalLatencyMs.sum();
    }

    public double getMaxLatencyMs() {
        return maxLatencyMs;
    }

    public double getAverageLatencyMs() {
        long count = requestCount.get();
        return count > 0 ? totalLatencyMs.sum() / count : 0;
    }

    public double getErrorRate() {
        long count = requestCount.get();
        return count > 0 ? (double) errorCount.get() / count : 0;
    }

    public double getRequestsPerSecond() {
        long elapsedMs = System.currentTimeMillis() - windowStartEpochMs;
        if (elapsedMs <= 0)
            return 0;
        return (double) windowRequestCount.get() / (elapsedMs / 1000.0);
    }

    public void recordRequest(double latencyMs, boolean isError) {
        requestCount.incrementAndGet();
        windowRequestCount.incrementAndGet();
        totalLatencyMs.add(latencyMs);
        if (latencyMs > maxLatencyMs) {
            maxLatencyMs = latencyMs;
        }
        if (isError) {
            errorCount.incrementAndGet();
        }
        this.lastSeenAt = Instant.now();
    }

    public void resetWindow() {
        windowStartEpochMs = System.currentTimeMillis();
        windowRequestCount.set(0);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Edge edge = (Edge) o;
        return id.equals(edge.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        return "Edge{%s, requests=%d, avgLatency=%.1fms, errorRate=%.2f}".formatted(
                id, requestCount.get(), getAverageLatencyMs(), getErrorRate());
    }
}
