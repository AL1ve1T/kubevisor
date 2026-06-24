import { useEffect, useState } from "react";
import { fetchHistory, fetchRestartTimeline } from "../api/graphApi";
import type { RestartEventDto } from "../models";

export interface NodeHistoryPoint {
    timestamp: string;
    cpuUtilization: number;
    memoryUtilization: number;
    totalRps: number;
}

export interface NodeHistoryData {
    points: NodeHistoryPoint[];
    restarts: RestartEventDto[];
    loading: boolean;
    error: string | null;
}

/** Races a promise against a ms-timeout so a hanging endpoint never blocks the UI. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            window.setTimeout(() => reject(new Error("Request timed out")), ms),
        ),
    ]);
}

const REQUEST_TIMEOUT_MS = 8_000;

export function useNodeHistory(nodeId: string, namespace: string): NodeHistoryData {
    const [state, setState] = useState<NodeHistoryData>({
        points: [],
        restarts: [],
        loading: true,
        error: null,
    });

    useEffect(() => {
        let cancelled = false;
        setState({ points: [], restarts: [], loading: true, error: null });

        // Use allSettled so a missing/hanging restarts endpoint never blocks
        // the history charts from rendering.
        Promise.allSettled([
            withTimeout(fetchHistory({ namespace }), REQUEST_TIMEOUT_MS),
            withTimeout(fetchRestartTimeline(nodeId, { namespace }), REQUEST_TIMEOUT_MS),
        ]).then(([historyResult, restartsResult]) => {
            if (cancelled) return;

            const snapshots = historyResult.status === "fulfilled" ? historyResult.value : [];
            const restarts = restartsResult.status === "fulfilled" ? restartsResult.value : [];

            const sorted = [...snapshots].sort(
                (a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
            );

            const points: NodeHistoryPoint[] = sorted.map((snap) => {
                const node = snap.nodes.find((n) => n.id === nodeId);
                const edges = snap.edges.filter(
                    (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
                );
                const pods = node?.pods ?? [];
                const peakCpu = pods.reduce((max, p) => Math.max(max, p.cpuUtilization), 0);
                const peakMem = pods.reduce((max, p) => Math.max(max, p.memoryUtilization), 0);
                return {
                    timestamp: snap.generatedAt,
                    cpuUtilization: peakCpu,
                    memoryUtilization: peakMem,
                    totalRps: edges.reduce((sum, e) => sum + e.requestsPerSecond, 0),
                };
            });

            setState({ points, restarts, loading: false, error: null });
        });

        return () => {
            cancelled = true;
        };
    }, [nodeId, namespace]);

    return state;
}
