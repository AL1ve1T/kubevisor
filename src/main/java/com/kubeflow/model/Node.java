package com.kubeflow.model;

import java.time.Instant;
import java.util.Objects;

/**
 * Represents a node in the service topology graph.
 * A node is a service, database, or external dependency.
 */
public class Node {

    private final String id;
    private String name;
    private NodeType type;
    private String namespace;
    private Instant lastSeenAt;
    // Resource utilization in [0.0, 1.0]; 0.0 means no data received yet
    private volatile double cpuUtilization;
    private volatile double memoryUtilization;

    // Pod health as scraped from the Kubernetes API
    private volatile PodPhase podPhase = PodPhase.UNKNOWN;
    private volatile int restartCount = 0;

    public Node(String id, String name, NodeType type, String namespace) {
        this.id = Objects.requireNonNull(id);
        this.name = Objects.requireNonNull(name);
        this.type = Objects.requireNonNull(type);
        this.namespace = namespace;
        this.lastSeenAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public NodeType getType() {
        return type;
    }

    public void setType(NodeType type) {
        this.type = type;
    }

    public String getNamespace() {
        return namespace;
    }

    public void setNamespace(String namespace) {
        this.namespace = namespace;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public void touch() {
        this.lastSeenAt = Instant.now();
    }

    public double getCpuUtilization() {
        return cpuUtilization;
    }

    public void setCpuUtilization(double cpuUtilization) {
        this.cpuUtilization = cpuUtilization;
    }

    public double getMemoryUtilization() {
        return memoryUtilization;
    }

    public void setMemoryUtilization(double memoryUtilization) {
        this.memoryUtilization = memoryUtilization;
    }

    public PodPhase getPodPhase() {
        return podPhase;
    }

    public void setPodPhase(PodPhase podPhase) {
        this.podPhase = podPhase;
    }

    public int getRestartCount() {
        return restartCount;
    }

    public void setRestartCount(int restartCount) {
        this.restartCount = restartCount;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Node node = (Node) o;
        return id.equals(node.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        return "Node{id='%s', name='%s', type=%s, namespace='%s'}".formatted(id, name, type, namespace);
    }
}
