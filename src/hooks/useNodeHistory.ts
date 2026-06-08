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

        Promise.all([
            fetchHistory({ namespace }),
            fetchRestartTimeline(nodeId, { namespace }),
        ])
            .then(([snapshots, restarts]) => {
                if (cancelled) return;

                const sorted = [...snapshots].sort(
                    (a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
                );

                const points: NodeHistoryPoint[] = sorted.map((snap) => {
                    const node = snap.nodes.find((n) => n.id === nodeId);
                    const edges = snap.edges.filter(
                        (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
                    );
                    return {
                        timestamp: snap.generatedAt,
                        cpuUtilization: node?.cpuUtilization ?? 0,
                        memoryUtilization: node?.memoryUtilization ?? 0,
                        totalRps: edges.reduce((sum, e) => sum + e.requestsPerSecond, 0),
                    };
                });

                setState({ points, restarts, loading: false, error: null });
            })
            .catch((err: Error) => {
                if (cancelled) return;
                setState({ points: [], restarts: [], loading: false, error: err.message });
            });

        return () => {
            cancelled = true;
        };
    }, [nodeId, namespace]);

    return state;
}
