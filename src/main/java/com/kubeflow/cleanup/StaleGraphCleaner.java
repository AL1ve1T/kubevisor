package com.kubeflow.cleanup;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.api.GraphUpdatePublisher;
import com.kubeflow.model.Edge;
import com.kubeflow.model.Node;
import com.kubeflow.support.KubeflowProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Periodically removes stale nodes and edges from the graph.
 */
@Component
public class StaleGraphCleaner {

    private static final Logger log = LoggerFactory.getLogger(StaleGraphCleaner.class);

    private final GraphStateManager graphStateManager;
    private final KubeflowProperties properties;
    private final GraphUpdatePublisher graphUpdatePublisher;

    public StaleGraphCleaner(GraphStateManager graphStateManager,
            KubeflowProperties properties,
            GraphUpdatePublisher graphUpdatePublisher) {
        this.graphStateManager = graphStateManager;
        this.properties = properties;
        this.graphUpdatePublisher = graphUpdatePublisher;
    }

    @Scheduled(fixedDelayString = "${kubeflow.cleanup.interval-seconds:30}000")
    public void cleanStaleElements() {
        Duration staleDuration = Duration.ofSeconds(properties.getStaleThresholdSeconds());
        Instant cutoff = Instant.now().minus(staleDuration);

        List<String> staleEdges = new ArrayList<>();
        for (var entry : graphStateManager.getEdges().entrySet()) {
            if (entry.getValue().getLastSeenAt().isBefore(cutoff)) {
                staleEdges.add(entry.getKey());
            }
        }

        List<String> staleNodes = new ArrayList<>();
        for (var entry : graphStateManager.getNodes().entrySet()) {
            if (entry.getValue().getLastSeenAt().isBefore(cutoff)) {
                staleNodes.add(entry.getKey());
            }
        }

        staleEdges.forEach(graphStateManager::removeEdge);
        staleNodes.forEach(graphStateManager::removeNode);

        if (!staleEdges.isEmpty() || !staleNodes.isEmpty()) {
            log.info("Cleaned {} stale edges and {} stale nodes", staleEdges.size(), staleNodes.size());
            graphUpdatePublisher.notifyIfChanged();
        }
    }
}
