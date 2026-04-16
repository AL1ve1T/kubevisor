package com.kubeflow.model;

import java.time.Instant;
import java.util.List;

/**
 * Frontend-facing representation of the current topology state.
 * Contains all nodes, edges, and metadata for the UI to render.
 */
public record GraphSnapshot(
        List<NodeDto> nodes,
        List<EdgeDto> edges,
        Instant generatedAt) {

    public record NodeDto(
            String id,
            String name,
            NodeType type,
            String namespace,
            Instant lastSeenAt) {
    }

    public record EdgeDto(
            String id,
            String sourceNodeId,
            String targetNodeId,
            String protocol,
            long requestCount,
            double requestsPerSecond,
            double averageLatencyMs,
            double maxLatencyMs,
            long errorCount,
            double errorRate,
            Instant lastSeenAt) {
    }
}
