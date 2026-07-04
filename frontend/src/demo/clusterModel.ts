import { NodeType } from "../models";

/**
 * Demo-only domain types. These describe a Kubernetes cluster parsed from raw
 * `kubectl` manifests and the metric-free topology skeleton derived from it.
 *
 * The demo never talks to the backend — it parses YAML in the browser, infers a
 * service-communication topology, then synthesises backend-shaped GraphSnapshots
 * locally (see {@link ./loadSimulator}). Everything downstream renders through the
 * exact same components as the live app.
 */

/** Synthetic input node id used for the left-hand "ingress" entry bar. */
export const INPUT_NODE_ID = "__ingress__";

/** A workload (Deployment / StatefulSet / …) extracted from the manifests. */
export interface ParsedWorkload {
    name: string;
    kind: string;
    replicas: number;
    type: NodeType;
    /** Whether the pod template declares a readiness/liveness probe. */
    hasProbe: boolean;
    labels: Record<string, string>;
    images: string[];
    /** Flattened env values (inline `env` + `envFrom` ConfigMap data). */
    envValues: string[];
}

/** A Kubernetes Service, used to map selectors → workloads and detect exposure. */
export interface ParsedService {
    name: string;
    selector: Record<string, string>;
    type: string; // ClusterIP | NodePort | LoadBalancer | ExternalName
}

/** An inferred directional dependency between two workloads. */
export interface InferredEdge {
    source: string;
    target: string;
    protocol: string;
}

/** The result of parsing a bundle of manifests. */
export interface ParsedCluster {
    namespace: string;
    workloads: ParsedWorkload[];
    edges: InferredEdge[];
    /** Workload names reachable from outside the cluster (behind ingress). */
    entryPoints: string[];
    warnings: string[];
}

/** A metric-free node in the topology skeleton. */
export interface TopologyNode {
    id: string;
    name: string;
    type: NodeType;
    replicas: number;
    hasProbe: boolean;
}

/** A metric-free edge in the topology skeleton. */
export interface TopologyEdge {
    id: string;
    source: string;
    target: string;
    protocol: string;
    fromInput: boolean;
}

/** The full skeleton fed to the load simulator on every tick. */
export interface ClusterTopology {
    namespace: string;
    nodes: TopologyNode[];
    edges: TopologyEdge[];
    /** Nodes the user can drive load on directly (SERVICE / GATEWAY). */
    serviceNodeIds: string[];
    warnings: string[];
}
