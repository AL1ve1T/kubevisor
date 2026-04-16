package com.kubeflow.aggregation;

import com.kubeflow.model.Edge;
import com.kubeflow.model.GraphSnapshot;
import com.kubeflow.model.InteractionEvent;
import com.kubeflow.model.Node;
import com.kubeflow.model.NodeType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Maintains the in-memory graph state: nodes and edges with rolling metrics.
 * Thread-safe for concurrent span processing.
 * OTLP messages update state here; the ScheduledSnapshotEmitter reads it every
 * second.
 */
@Component
public class GraphStateManager {

    private static final Logger log = LoggerFactory.getLogger(GraphStateManager.class);

    private final ConcurrentMap<String, Node> nodes = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Edge> edges = new ConcurrentHashMap<>();

    public void registerNode(String serviceName, String namespace) {
        if (serviceName == null || serviceName.isBlank()) {
            return;
        }
        Node node = nodes.computeIfAbsent(serviceName,
                id -> new Node(id, id, com.kubeflow.model.NodeType.SERVICE, namespace));
        node.touch();
    }

    public void registerEdge(InteractionEvent event) {
        // Register both nodes
        nodes.computeIfAbsent(event.sourceService(),
                id -> new Node(id, id, com.kubeflow.model.NodeType.SERVICE, event.sourceNamespace())).touch();
        nodes.computeIfAbsent(event.targetService(),
                id -> new Node(id, id, event.targetType(), event.targetNamespace())).touch();

        // Create skeleton edge if it doesn't exist yet (no metrics recorded)
        String edgeId = event.sourceService() + "->" + event.targetService();
        edges.computeIfAbsent(edgeId,
                id -> new Edge(event.sourceService(), event.targetService(), event.protocol()));

        log.debug("Registered edge skeleton: {} -> {}", event.sourceService(), event.targetService());
    }

    public void recordTraffic(InteractionEvent event) {
        String edgeId = event.sourceService() + "->" + event.targetService();
        Edge edge = edges.get(edgeId);
        if (edge != null) {
            edge.recordRequest(event.latencyMs(), event.isError());
            log.debug("Recorded traffic: {} -> {} ({}ms, error={})",
                    event.sourceService(), event.targetService(), event.latencyMs(), event.isError());
        }
    }

    public void registerNetworkFlowEdge(String source, String target, String protocol, NodeType targetType) {
        nodes.computeIfAbsent(source,
                id -> new Node(id, id, NodeType.SERVICE, null)).touch();
        nodes.computeIfAbsent(target,
                id -> new Node(id, id, targetType, null)).touch();

        String edgeId = source + "->" + target;
        Edge edge = edges.computeIfAbsent(edgeId,
                id -> new Edge(source, target, protocol));
        edge.recordRequest(0, false);
        log.debug("Registered network flow edge: {} -> {}", source, target);
    }

    public void applyEvent(InteractionEvent event) {
        registerEdge(event);
        recordTraffic(event);
    }

    public GraphSnapshot buildSnapshot() {
        List<GraphSnapshot.NodeDto> nodeDtos = nodes.values().stream()
                .map(n -> new GraphSnapshot.NodeDto(n.getId(), n.getName(), n.getType(), n.getNamespace(),
                        n.getLastSeenAt()))
                .toList();

        List<GraphSnapshot.EdgeDto> edgeDtos = edges.values().stream()
                .map(e -> new GraphSnapshot.EdgeDto(
                        e.getId(), e.getSourceNodeId(), e.getTargetNodeId(),
                        e.getProtocol(), e.getRequestCount(), e.getRequestsPerSecond(),
                        e.getAverageLatencyMs(), e.getMaxLatencyMs(),
                        e.getErrorCount(), e.getErrorRate(), e.getLastSeenAt()))
                .toList();

        return new GraphSnapshot(nodeDtos, edgeDtos, Instant.now());
    }

    public void removeNode(String nodeId) {
        nodes.remove(nodeId);
        edges.entrySet().removeIf(entry -> entry.getValue().getSourceNodeId().equals(nodeId) ||
                entry.getValue().getTargetNodeId().equals(nodeId));
    }

    public void removeEdge(String edgeId) {
        edges.remove(edgeId);
    }

    public ConcurrentMap<String, Node> getNodes() {
        return nodes;
    }

    public ConcurrentMap<String, Edge> getEdges() {
        return edges;
    }
}
