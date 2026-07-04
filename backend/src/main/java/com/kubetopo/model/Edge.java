package com.kubetopo.model;

import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Represents a directed edge between two nodes in the topology graph.
 *
 * Traffic metrics describe a single real one-second interval of observed
 * traffic — not a rolling average. Requests are bucketed by the span's own
 * event time (not arrival time), because telemetry is exported in batches: a
 * whole batch of spans arrives at once but represents several seconds of real
 * traffic. The edge reports the most recently *completed* one-second bucket and
 * holds that value between export batches, so a steady 10 req/s reads as ~10
 * instead of flickering between a spike and zero. Once no new traffic has been
 * seen for {@link #DEFAULT_TRAFFIC_HOLD_SECONDS} (or the configured hold passed
 * by the snapshot path), all metrics drop to zero.
 *
 * Lifetime counter (errorCount) accumulates for the full lifetime of the edge
 * and is kept for display purposes.
 */
public class Edge {

    // How long the last measured per-second value keeps being reported after the
    // newest observed traffic, before the edge is treated as idle and reports
    // zero. Must exceed the telemetry export interval (SDK batch + collector
    // flush) so steady traffic does not flicker between export batches. Used as
    // the default when no explicit hold is supplied; the snapshot path passes a
    // configurable value (kubetopo.traffic-hold-seconds).
    public static final long DEFAULT_TRAFFIC_HOLD_SECONDS = 10;

    private final String id;
    private final String sourceNodeId;
    private final String targetNodeId;
    private String protocol;
    private Instant lastSeenAt;
    // Set only when an actual request span is recorded; null for topology-only
    // (Beyla) edges.
    private volatile Instant lastTrafficAt;

    // Lifetime counter – used for the DTO field errorCount
    private final AtomicLong errorCount = new AtomicLong(0);

    // Two adjacent one-second buckets keyed by span event-time second: the latest
    // second seen so far ("current", possibly still filling as later batches
    // deliver its remaining spans) and the one before it ("previous", complete).
    // Reported metrics come from "previous" so a partially-delivered second is
    // never shown. Guarded by lock.
    private final Object lock = new Object();
    private long currentSecond = Long.MIN_VALUE;
    private long currentRequests;
    private long currentErrors;
    private double currentLatencySum;
    private double currentMaxLatency;
    private long previousSecond = Long.MIN_VALUE;
    private long previousRequests;
    private long previousErrors;
    private double previousLatencySum;
    private double previousMaxLatency;

    public Edge(String sourceNodeId, String targetNodeId, String protocol) {
        this.id = sourceNodeId + "->" + targetNodeId;
        this.sourceNodeId = Objects.requireNonNull(sourceNodeId);
        this.targetNodeId = Objects.requireNonNull(targetNodeId);
        this.protocol = protocol;
        this.lastSeenAt = Instant.now();
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

    public Instant getLastTrafficAt() {
        return lastTrafficAt;
    }

    public long getErrorCount() {
        return errorCount.get();
    }

    // ---- metric accessors (most recently completed one-second bucket) ----
    //
    // All reads report the "previous" second — the latest fully-delivered one —
    // and return zero once no new traffic has arrived for the hold window. The
    // single-arg variants use DEFAULT_TRAFFIC_HOLD_SECONDS; the snapshot path
    // supplies the configured hold via the two-arg variants.

    public double getRequestsPerSecond() {
        return getRequestsPerSecond(Instant.now());
    }

    public double getRequestsPerSecond(Instant snapshotTime) {
        return getRequestsPerSecond(snapshotTime, DEFAULT_TRAFFIC_HOLD_SECONDS);
    }

    public double getRequestsPerSecond(Instant snapshotTime, long holdSeconds) {
        synchronized (lock) {
            return isStale(snapshotTime, holdSeconds) ? 0.0 : (double) previousRequests;
        }
    }

    public double getAverageLatencyMs() {
        return getAverageLatencyMs(Instant.now());
    }

    public double getAverageLatencyMs(Instant snapshotTime) {
        return getAverageLatencyMs(snapshotTime, DEFAULT_TRAFFIC_HOLD_SECONDS);
    }

    public double getAverageLatencyMs(Instant snapshotTime, long holdSeconds) {
        synchronized (lock) {
            if (isStale(snapshotTime, holdSeconds) || previousRequests == 0) {
                return 0.0;
            }
            return previousLatencySum / previousRequests;
        }
    }

    public double getMaxLatencyMs() {
        return getMaxLatencyMs(Instant.now());
    }

    public double getMaxLatencyMs(Instant snapshotTime) {
        return getMaxLatencyMs(snapshotTime, DEFAULT_TRAFFIC_HOLD_SECONDS);
    }

    public double getMaxLatencyMs(Instant snapshotTime, long holdSeconds) {
        synchronized (lock) {
            return isStale(snapshotTime, holdSeconds) ? 0.0 : previousMaxLatency;
        }
    }

    public double getErrorRate() {
        return getErrorRate(Instant.now());
    }

    public double getErrorRate(Instant snapshotTime) {
        return getErrorRate(snapshotTime, DEFAULT_TRAFFIC_HOLD_SECONDS);
    }

    public double getErrorRate(Instant snapshotTime, long holdSeconds) {
        synchronized (lock) {
            if (isStale(snapshotTime, holdSeconds) || previousRequests == 0) {
                return 0.0;
            }
            return (double) previousErrors / previousRequests;
        }
    }

    // ---- mutation ----

    // Records one observed request, bucketed by its span event-time second so a
    // batch of spans is spread across the seconds it actually happened in rather
    // than lumped into the single second the batch was received.
    public void recordRequest(Instant eventTime, double latencyMs, boolean isError) {
        if (isError) {
            errorCount.incrementAndGet();
        }
        long second = eventTime.getEpochSecond();
        synchronized (lock) {
            addToSecond(second, latencyMs, isError);
        }
        this.lastSeenAt = Instant.now();
        this.lastTrafficAt = Instant.now();
    }

    public void touch() {
        this.lastSeenAt = Instant.now();
    }

    // ---- helpers ----

    // Adds a request to the bucket for its event-time second, keeping only the two
    // most recent adjacent seconds. A newer second pushes "current" down into the
    // now-complete "previous"; same-second events accumulate; events older than
    // "previous" are dropped (rare late spans). Must hold {@code lock}.
    private void addToSecond(long second, double latencyMs, boolean isError) {
        if (second > currentSecond) {
            previousSecond = currentSecond;
            previousRequests = currentRequests;
            previousErrors = currentErrors;
            previousLatencySum = currentLatencySum;
            previousMaxLatency = currentMaxLatency;
            currentSecond = second;
            currentRequests = 0;
            currentErrors = 0;
            currentLatencySum = 0.0;
            currentMaxLatency = 0.0;
            accumulateCurrent(latencyMs, isError);
        } else if (second == currentSecond) {
            accumulateCurrent(latencyMs, isError);
        } else if (second == previousSecond) {
            previousRequests++;
            previousLatencySum += latencyMs;
            if (latencyMs > previousMaxLatency) {
                previousMaxLatency = latencyMs;
            }
            if (isError) {
                previousErrors++;
            }
        }
        // else: older than "previous" → dropped
    }

    private void accumulateCurrent(double latencyMs, boolean isError) {
        currentRequests++;
        currentLatencySum += latencyMs;
        if (latencyMs > currentMaxLatency) {
            currentMaxLatency = latencyMs;
        }
        if (isError) {
            currentErrors++;
        }
    }

    // True when no traffic has been seen recently enough to report a live rate.
    // Must hold {@code lock}.
    private boolean isStale(Instant snapshotTime, long holdSeconds) {
        if (currentSecond == Long.MIN_VALUE) {
            return true;
        }
        return snapshotTime.getEpochSecond() - currentSecond > holdSeconds;
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
        return "Edge{%s, rps=%.2f, avgLatency=%.1fms, errorRate=%.2f}".formatted(
                id, getRequestsPerSecond(), getAverageLatencyMs(), getErrorRate());
    }
}
