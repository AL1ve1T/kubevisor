import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphSnapshot, NamespaceRequestTimelinePoint } from "../models";
import type { ClusterTopology } from "./clusterModel";
import { INPUT_NODE_ID } from "./clusterModel";
import { createSimulator, type LoadConfig } from "./loadSimulator";

const REAL_TICK_MS = 2500;
const SIM_STEP_MS = 5_000;
const WINDOW_MS = 8 * 60_000;
const POINTS = 64;
const MAX_BUFFER = 200;

export interface DemoSimulationResult {
    liveSnapshot: GraphSnapshot;
    history: GraphSnapshot[];
    timelinePoints: NamespaceRequestTimelinePoint[];
    windowStartMs: number;
    windowEndMs: number;
}

function toTimelinePoint(snapshot: GraphSnapshot): NamespaceRequestTimelinePoint {
    const inputEdges = snapshot.edges.filter((edge) => edge.sourceNodeId === INPUT_NODE_ID);
    const counted = inputEdges.length > 0 ? inputEdges : snapshot.edges;
    let totalPods = 0;
    let notReadyPods = 0;
    for (const node of snapshot.nodes) {
        const pods = node.pods ?? [];
        totalPods += pods.length;
        notReadyPods += pods.filter((pod) => pod.podPhase !== "RUNNING").length;
    }
    return {
        timestamp: snapshot.generatedAt,
        totalRequests: counted.reduce((sum, edge) => sum + edge.requestsPerSecond, 0),
        totalPods,
        notReadyPods,
    };
}

/**
 * Drives the in-browser cluster simulation: it advances a virtual clock while
 * "playing", appends each generated snapshot to a rolling history buffer for the
 * timeline scrubber, and recomputes the live snapshot whenever the clock or the
 * load configuration changes.
 */
export function useDemoSimulation(
    topology: ClusterTopology,
    config: LoadConfig,
    playing: boolean,
    speed: number,
): DemoSimulationResult {
    const simulator = useMemo(() => createSimulator(topology), [topology]);

    const configRef = useRef(config);
    configRef.current = config;

    const configKey = useMemo(
        () => JSON.stringify({ mode: config.mode, intensity: config.intensity, levels: config.manualLevels }),
        [config],
    );

    const [nowMs, setNowMs] = useState(() => Date.now());
    const nowRef = useRef(nowMs);
    nowRef.current = nowMs;

    const [history, setHistory] = useState<GraphSnapshot[]>([]);

    // Seed (and reseed) the history buffer whenever the topology changes so the
    // scrubber always has a full window to display.
    useEffect(() => {
        const end = Date.now();
        nowRef.current = end;
        setNowMs(end);
        setHistory(simulator.historyWindow(end, WINDOW_MS, POINTS, configRef.current));
    }, [simulator]);

    // Advance the virtual clock and append fresh snapshots while playing.
    useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(() => {
            const next = nowRef.current + SIM_STEP_MS * speed;
            nowRef.current = next;
            setNowMs(next);
            setHistory((prev) => {
                const snapshot = simulator.snapshotAt(next, configRef.current);
                const merged = [...prev, snapshot].filter(
                    (s) => new Date(s.generatedAt).getTime() >= next - WINDOW_MS,
                );
                return merged.length > MAX_BUFFER ? merged.slice(merged.length - MAX_BUFFER) : merged;
            });
        }, REAL_TICK_MS);
        return () => window.clearInterval(id);
    }, [playing, speed, simulator]);

    const liveSnapshot = useMemo(
        () => simulator.snapshotAt(nowMs, configRef.current),
        [simulator, nowMs, configKey],
    );

    const timelinePoints = useMemo<NamespaceRequestTimelinePoint[]>(
        () => history.map(toTimelinePoint),
        [history],
    );

    const windowEndMs = nowMs;
    const windowStartMs =
        history.length > 0 ? new Date(history[0].generatedAt).getTime() : nowMs - WINDOW_MS;

    return { liveSnapshot, history, timelinePoints, windowStartMs, windowEndMs };
}
