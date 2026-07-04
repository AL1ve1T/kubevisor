import type { EdgeDto, GraphSnapshot, LoadLevel, NodeDto, PodDto, PodPhase } from "../models";
import { NodeType } from "../models";
import type { ClusterTopology, TopologyEdge, TopologyNode } from "./clusterModel";
import { clamp, rand01, smoothNoise } from "./prng";

/** How hard the user is driving a service. */
export type DemandLevel = "IDLE" | "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL";

export type LoadMode = "scenario" | "manual";

export interface LoadConfig {
    mode: LoadMode;
    /** Global multiplier on all generated load (≈0.2 – 2.0). */
    intensity: number;
    /** Per-service target level, used in `manual` mode. */
    manualLevels: Record<string, DemandLevel>;
}

export interface DemoSimulator {
    snapshotAt(tMs: number, config: LoadConfig): GraphSnapshot;
    historyWindow(endMs: number, windowMs: number, points: number, config: LoadConfig): GraphSnapshot[];
}

export const DEMAND_LEVELS: DemandLevel[] = ["IDLE", "NORMAL", "ELEVATED", "HIGH", "CRITICAL"];

/** Target utilisation (inbound / capacity) for each manual level. */
const UTIL_TARGET: Record<DemandLevel, number> = {
    IDLE: 0,
    NORMAL: 0.4,
    ELEVATED: 0.7,
    HIGH: 0.95,
    CRITICAL: 1.35,
};

/** Request capacity per replica, by workload type. */
const CAPACITY_PER_REPLICA: Record<NodeType, number> = {
    [NodeType.SERVICE]: 60,
    [NodeType.GATEWAY]: 90,
    [NodeType.DATABASE]: 130,
    [NodeType.CACHE]: 400,
    [NodeType.QUEUE]: 320,
    [NodeType.INPUT]: 1,
};

const BASE_LATENCY_MS: Record<string, number> = {
    HTTP: 9,
    gRPC: 6,
    SQL: 4,
    TCP: 3,
    AMQP: 5,
};

const PHASE_SEVERITY: Record<PodPhase, number> = {
    CRASH_LOOP: 5,
    FAILED: 4,
    NOT_READY: 3,
    PENDING: 2,
    RUNNING: 1,
    UNKNOWN: 0,
};

function capacityOf(node: TopologyNode): number {
    return CAPACITY_PER_REPLICA[node.type] * Math.max(1, node.replicas);
}

function levelFromUtil(util: number): LoadLevel {
    if (util < 0.5) return "NORMAL";
    if (util < 0.78) return "ELEVATED";
    if (util < 1.0) return "HIGH";
    return "CRITICAL";
}

function edgeWeight(edgeId: string): number {
    return 0.18 + rand01(`w:${edgeId}`) * 0.27;
}

/** One full load-test cycle: ramp → peak → incident → recovery. */
const SCENARIO_CYCLE_MS = 6 * 60_000;

function easeInOut(t: number): number {
    const c = clamp(t, 0, 1);
    return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Global traffic level (≈0.10 quiet .. ≈0.78 peak) over the cycle. */
function scenarioTraffic(p: number): number {
    if (p < 0.12) return 0.1; // quiet hold
    if (p < 0.3) return lerp(0.1, 0.78, easeInOut((p - 0.12) / 0.18)); // ramp up
    if (p < 0.74) return 0.78; // peak hold
    if (p < 0.9) return lerp(0.78, 0.1, easeInOut((p - 0.74) / 0.16)); // wind down
    return 0.1; // quiet hold
}

/** Incident severity [0..1]: a single hump while traffic is near its peak. */
function scenarioIncident(p: number): number {
    const start = 0.46;
    const mid = 0.6;
    const end = 0.76;
    if (p <= start || p >= end) return 0;
    return p < mid
        ? easeInOut((p - start) / (mid - start))
        : easeInOut((end - p) / (end - mid));
}

interface ScenarioState {
    traffic: number;
    incident: number;
}

function scenarioAt(tMs: number, intensity: number): ScenarioState {
    const p = (((tMs % SCENARIO_CYCLE_MS) + SCENARIO_CYCLE_MS) % SCENARIO_CYCLE_MS) / SCENARIO_CYCLE_MS;
    const drift = (smoothNoise("global-traffic", tMs, 240_000) - 0.5) * 0.06;
    return {
        traffic: clamp((scenarioTraffic(p) + drift) * intensity, 0, 1.3),
        incident: scenarioIncident(p),
    };
}

/**
 * Utilisation a directly-driven SERVICE/GATEWAY node is held at. In manual mode
 * the user's level wins; in the load-test scenario every entry service tracks the
 * shared traffic curve (with a small stable per-service offset) so the whole
 * cluster ramps together like a real load test rather than jittering at random.
 */
function injectedUtil(node: TopologyNode, tMs: number, config: LoadConfig, traffic: number): number {
    if (config.mode === "manual") {
        const level = config.manualLevels[node.id] ?? "NORMAL";
        const target = UTIL_TARGET[level];
        if (target === 0) return 0;
        return clamp((target + (smoothNoise(node.id, tMs, 120_000) - 0.5) * 0.05) * config.intensity, 0, 1.7);
    }
    const factor = 0.8 + rand01(`svc:${node.id}`) * 0.28;
    const drift = (smoothNoise(`drift:${node.id}`, tMs, 200_000) - 0.5) * 0.05;
    return clamp(traffic * factor + drift, 0, 1.6);
}

/** Small idle baseline so non-entry services still show life in the scenario. */
function baselineUtil(node: TopologyNode, tMs: number, config: LoadConfig): number {
    const base = smoothNoise(`base:${node.id}`, tMs, 150_000);
    return clamp((0.04 + base * 0.1) * config.intensity, 0, 0.3);
}

function worstPhase(a: PodPhase, b: PodPhase): PodPhase {
    return PHASE_SEVERITY[a] >= PHASE_SEVERITY[b] ? a : b;
}

interface PodComputation {
    pods: PodDto[];
    rollupPhase: PodPhase;
    restartTotal: number;
    lastRestartAt: string | null;
    lastRestartReason: string | null;
}

function buildPods(
    node: TopologyNode,
    util: number,
    tMs: number,
    generatedAt: string,
): PodComputation {
    const shortHash = (rand01(`rs:${node.id}`) * 1e9).toString(36).slice(0, 5);
    const pods: PodDto[] = [];
    let rollupPhase: PodPhase = "RUNNING";
    let restartTotal = 0;
    let lastRestartAt: string | null = null;
    let lastRestartReason: string | null = null;
    let newestRestartMs = -1;

    for (let i = 0; i < node.replicas; i++) {
        const suffix = (rand01(`pod:${node.id}:${i}`) * 1e9).toString(36).slice(0, 5);
        const podName = `${node.name}-${shortHash}-${suffix}`;
        const cpuNoise = smoothNoise(`cpu:${podName}`, tMs, 180_000);
        const memNoise = smoothNoise(`mem:${podName}`, tMs, 240_000);
        const offset = (rand01(`off:${podName}`) - 0.5) * 0.08;

        const cpu = clamp(util + (cpuNoise - 0.5) * 0.07, 0.02, 0.99);
        const memory = clamp(0.18 + util * 0.5 + (memNoise - 0.5) * 0.08, 0.05, 0.97);
        const eff = util + offset + (cpuNoise - 0.5) * 0.08;

        let phase: PodPhase = "RUNNING";
        if (eff >= 1.35) {
            phase = "CRASH_LOOP";
        } else if (eff >= 1.12) {
            phase = node.hasProbe ? "NOT_READY" : rand01(`cl:${podName}`) > 0.5 ? "CRASH_LOOP" : "RUNNING";
        } else if (eff >= 0.95) {
            phase = node.hasProbe ? "NOT_READY" : "RUNNING";
        }
        if (memory > 0.93 && eff > 1.0) phase = "CRASH_LOOP";

        let restartCount = 0;
        let restartReason: string | null = null;
        let restartAtMs: number | null = null;
        if (phase === "CRASH_LOOP") {
            restartCount = 2 + Math.floor((eff - 1) * 8 + rand01(`rc:${podName}`) * 4);
            restartReason = memory > 0.9 ? "OOMKilled" : eff > 1.3 ? "Error" : "ProbeFailed";
            restartAtMs = tMs - rand01(`ra:${podName}`) * 4 * 60_000;
        } else if (phase === "NOT_READY") {
            if (rand01(`nr:${podName}`) > 0.6) {
                restartCount = 1;
                restartReason = "ProbeFailed";
                restartAtMs = tMs - rand01(`ra:${podName}`) * 8 * 60_000;
            }
        }

        const restartAtIso = restartAtMs !== null ? new Date(restartAtMs).toISOString() : null;
        pods.push({
            podName,
            cpuUtilization: Number(cpu.toFixed(3)),
            memoryUtilization: Number(memory.toFixed(3)),
            podPhase: phase,
            restartCount,
            lastRestartAt: restartAtIso,
            lastRestartReason: restartReason,
            lastSeenAt: generatedAt,
        });

        rollupPhase = worstPhase(rollupPhase, phase);
        restartTotal += restartCount;
        if (restartAtMs !== null && restartAtMs > newestRestartMs) {
            newestRestartMs = restartAtMs;
            lastRestartAt = restartAtIso;
            lastRestartReason = restartReason;
        }
    }

    return { pods, rollupPhase, restartTotal, lastRestartAt, lastRestartReason };
}

export function createSimulator(topology: ClusterTopology): DemoSimulator {
    const nodes = topology.nodes;
    const depEdges = topology.edges.filter((edge) => !edge.fromInput);
    const inputEdges = topology.edges.filter((edge) => edge.fromInput);
    const entryTargets = new Set(inputEdges.map((edge) => edge.target));
    const isService = (node: TopologyNode): boolean =>
        node.type === NodeType.SERVICE || node.type === NodeType.GATEWAY;

    // Deterministic incident victim for the load-test scenario: prefer a database
    // (the classic bottleneck under load), otherwise the most depended-on node.
    const inboundCount = new Map<string, number>();
    for (const edge of depEdges) {
        inboundCount.set(edge.target, (inboundCount.get(edge.target) ?? 0) + 1);
    }
    const pickByInbound = (list: TopologyNode[]): TopologyNode | null =>
        list.length === 0
            ? null
            : list.reduce((best, node) =>
                (inboundCount.get(node.id) ?? 0) > (inboundCount.get(best.id) ?? 0) ? node : best,
            );
    const candidates = nodes.filter((node) => node.type !== NodeType.INPUT);
    const victim =
        pickByInbound(candidates.filter((node) => node.type === NodeType.DATABASE)) ??
        pickByInbound(candidates);
    const victimCallers = victim
        ? depEdges.filter((edge) => edge.target === victim.id).map((edge) => edge.source)
        : [];

    function snapshotAt(tMs: number, config: LoadConfig): GraphSnapshot {
        const generatedAt = new Date(tMs).toISOString();
        const scenario = config.mode === "scenario" ? scenarioAt(tMs, config.intensity) : null;

        // A node is "injected" when its load is driven directly rather than by
        // upstream traffic: in manual mode every service is user-controlled; in
        // the load-test scenario only entry-point services receive external
        // demand and the rest of the cluster lights up from the resulting cascade.
        const isInjected = (node: TopologyNode): boolean => {
            if (!isService(node)) return false;
            return config.mode === "manual" ? true : entryTargets.has(node.id);
        };

        // Fixed throughput (req/s a node sustains) for injected nodes; a small
        // idle baseline for non-injected scenario services; 0 otherwise.
        const fixedThroughput = new Map<string, number>();
        const baseThroughput = new Map<string, number>();
        for (const node of nodes) {
            if (node.type === NodeType.INPUT) continue;
            const cap = capacityOf(node);
            if (isInjected(node)) {
                fixedThroughput.set(node.id, injectedUtil(node, tMs, config, scenario?.traffic ?? 0) * cap);
            } else if (config.mode === "scenario" && isService(node)) {
                baseThroughput.set(node.id, baselineUtil(node, tMs, config) * cap);
            }
        }

        // Relax the cascade: injected nodes hold their throughput, everyone else
        // accumulates inbound calls from their callers (plus any idle baseline).
        const throughput = new Map<string, number>();
        for (const node of nodes) {
            if (node.type === NodeType.INPUT) continue;
            throughput.set(node.id, fixedThroughput.get(node.id) ?? baseThroughput.get(node.id) ?? 0);
        }
        const edgeRps = new Map<string, number>();
        for (let pass = 0; pass < 3; pass++) {
            const received = new Map<string, number>();
            for (const edge of depEdges) {
                const r = (throughput.get(edge.source) ?? 0) * edgeWeight(edge.id);
                edgeRps.set(edge.id, r);
                received.set(edge.target, (received.get(edge.target) ?? 0) + r);
            }
            for (const node of nodes) {
                if (node.type === NodeType.INPUT) continue;
                if (fixedThroughput.has(node.id)) continue; // injected → held constant
                const cap = capacityOf(node);
                const value = (baseThroughput.get(node.id) ?? 0) + (received.get(node.id) ?? 0);
                throughput.set(node.id, clamp(value, 0, cap * 1.8));
            }
        }

        // Final per-node utilisation.
        const util = new Map<string, number>();
        for (const node of nodes) {
            if (node.type === NodeType.INPUT) continue;
            const cap = capacityOf(node);
            const value = cap > 0 ? (throughput.get(node.id) ?? 0) / cap : 0;
            util.set(node.id, clamp(value, 0, 1.8));
        }

        // Scripted incident: during the scenario's incident window the victim
        // saturates into an outage (CRITICAL load, crashing pods) and its direct
        // callers degrade as they wait on it — a clear, locatable failure that the
        // user can pinpoint in time (timeline) and place (the red sub-graph).
        if (scenario && scenario.incident > 0 && victim) {
            const sev = scenario.incident;
            util.set(victim.id, Math.max(util.get(victim.id) ?? 0, 1.08 + sev * 0.45));
            for (const callerId of victimCallers) {
                util.set(callerId, Math.max(util.get(callerId) ?? 0, 0.82 + sev * 0.32));
            }
        }

        const dtoNodes: NodeDto[] = nodes.map((node) => {
            if (node.type === NodeType.INPUT) {
                return {
                    id: node.id,
                    name: node.name,
                    type: NodeType.INPUT,
                    podPhase: "UNKNOWN",
                    podCount: 0,
                    restartCount: 0,
                    lastRestartAt: null,
                    lastRestartReason: null,
                    lastSeenAt: generatedAt,
                    pods: [],
                };
            }
            const u = util.get(node.id) ?? 0;
            const computed = buildPods(node, u, tMs, generatedAt);
            return {
                id: node.id,
                name: node.name,
                type: node.type,
                podPhase: computed.rollupPhase,
                podCount: node.replicas,
                restartCount: computed.restartTotal,
                lastRestartAt: computed.lastRestartAt,
                lastRestartReason: computed.lastRestartReason,
                lastSeenAt: generatedAt,
                pods: computed.pods,
            };
        });

        const dtoEdges: EdgeDto[] = topology.edges.map((edge) =>
            buildEdge(edge, tMs, generatedAt, throughput, edgeRps, util),
        );

        return {
            namespace: topology.namespace,
            nodes: dtoNodes,
            edges: dtoEdges,
            generatedAt,
        };
    }

    function buildEdge(
        edge: TopologyEdge,
        tMs: number,
        generatedAt: string,
        throughput: Map<string, number>,
        edgeRps: Map<string, number>,
        util: Map<string, number>,
    ): EdgeDto {
        const targetUtil = util.get(edge.target) ?? 0;
        const rawRps = edge.fromInput
            ? throughput.get(edge.target) ?? 0
            : edgeRps.get(edge.id) ?? 0;
        const rps = rawRps < 0.1 ? 0 : Number(rawRps.toFixed(1));

        if (rps === 0) {
            return {
                id: edge.id,
                sourceNodeId: edge.source,
                targetNodeId: edge.target,
                protocol: edge.protocol,
                requestsPerSecond: 0,
                averageLatencyMs: 0,
                maxLatencyMs: 0,
                errorCount: 0,
                errorRate: 0,
                loadLevel: "NORMAL",
                lastSeenAt: generatedAt,
            };
        }

        const base = BASE_LATENCY_MS[edge.protocol] ?? 8;
        const latNoise = smoothNoise(`lat:${edge.id}`, tMs, 150_000);
        const avgLatency = base * (1 + targetUtil * targetUtil * 3.5) + latNoise * base * 0.15;
        const maxLatency =
            avgLatency * (2.2 + rand01(`mx:${edge.id}`) * 1.5) + (targetUtil > 1 ? avgLatency * 2 : 0);

        let errorRate: number;
        if (targetUtil < 0.85) {
            errorRate = smoothNoise(`err:${edge.id}`, tMs, 180_000) * 0.004;
        } else if (targetUtil < 1.0) {
            errorRate = 0.01 + ((targetUtil - 0.85) / 0.15) * 0.05;
        } else {
            errorRate = clamp(0.06 + (targetUtil - 1.0) * 0.35, 0, 0.45);
        }
        errorRate = clamp(errorRate + (smoothNoise(`erj:${edge.id}`, tMs, 120_000) - 0.5) * 0.006, 0, 0.5);

        return {
            id: edge.id,
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            protocol: edge.protocol,
            requestsPerSecond: rps,
            averageLatencyMs: Number(avgLatency.toFixed(1)),
            maxLatencyMs: Number(maxLatency.toFixed(1)),
            errorCount: Math.round(rps * errorRate),
            errorRate: Number(errorRate.toFixed(4)),
            loadLevel: levelFromUtil(targetUtil),
            lastSeenAt: generatedAt,
        };
    }

    function historyWindow(
        endMs: number,
        windowMs: number,
        points: number,
        config: LoadConfig,
    ): GraphSnapshot[] {
        const count = Math.max(2, points);
        const step = windowMs / (count - 1);
        const out: GraphSnapshot[] = [];
        for (let i = 0; i < count; i++) {
            out.push(snapshotAt(endMs - windowMs + i * step, config));
        }
        return out;
    }

    return { snapshotAt, historyWindow };
}
