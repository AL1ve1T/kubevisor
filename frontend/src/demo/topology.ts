import { NodeType } from "../models";
import type { ClusterTopology, ParsedCluster, TopologyEdge, TopologyNode } from "./clusterModel";
import { INPUT_NODE_ID } from "./clusterModel";

/**
 * Turn a {@link ParsedCluster} into the metric-free skeleton the simulator
 * decorates each tick. A synthetic INPUT node ("ingress") is prepended and wired
 * to every entry-point workload so traffic appears to enter from the left, just
 * like a real backend snapshot.
 */
export function buildTopology(cluster: ParsedCluster): ClusterTopology {
    const nodes: TopologyNode[] = cluster.workloads.map((workload) => ({
        id: workload.name,
        name: workload.name,
        type: workload.type,
        replicas: Math.max(1, workload.replicas),
        hasProbe: workload.hasProbe,
    }));

    const ids = new Set(nodes.map((node) => node.id));
    const edges: TopologyEdge[] = [];
    const seen = new Set<string>();

    for (const dep of cluster.edges) {
        if (dep.source === dep.target) continue;
        if (!ids.has(dep.source) || !ids.has(dep.target)) continue;
        const id = `${dep.source}->${dep.target}`;
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({
            id,
            source: dep.source,
            target: dep.target,
            protocol: dep.protocol,
            fromInput: false,
        });
    }

    const entryPoints = cluster.entryPoints.filter((name) => ids.has(name));
    if (entryPoints.length > 0) {
        nodes.unshift({
            id: INPUT_NODE_ID,
            name: "ingress",
            type: NodeType.INPUT,
            replicas: 0,
            hasProbe: false,
        });
        for (const entry of entryPoints) {
            const id = `${INPUT_NODE_ID}->${entry}`;
            if (seen.has(id)) continue;
            seen.add(id);
            edges.push({
                id,
                source: INPUT_NODE_ID,
                target: entry,
                protocol: "HTTP",
                fromInput: true,
            });
        }
    }

    const serviceNodeIds = nodes
        .filter((node) => node.type === NodeType.SERVICE || node.type === NodeType.GATEWAY)
        .map((node) => node.id);

    return {
        namespace: cluster.namespace,
        nodes,
        edges,
        serviceNodeIds,
        warnings: cluster.warnings,
    };
}
