import { useEffect, useState } from "react";
import { fetchNamespaceRequestTimeline } from "../api/graphApi";
import type { NamespaceRequestTimelinePoint } from "../models";

export interface NamespaceRequestTimelineData {
    points: NamespaceRequestTimelinePoint[];
    loading: boolean;
    error: string | null;
}

export function useNamespaceRequestTimeline(
    namespace: string | null,
    fromMs: number,
    toMs: number,
): NamespaceRequestTimelineData {
    const [state, setState] = useState<NamespaceRequestTimelineData>({
        points: [],
        loading: false,
        error: null,
    });

    useEffect(() => {
        if (!namespace) {
            setState({ points: [], loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        fetchNamespaceRequestTimeline(namespace, {
            from: new Date(fromMs).toISOString(),
            to: new Date(toMs).toISOString(),
        })
            .then((points) => {
                if (cancelled) return;
                const sorted = [...points].sort(
                    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                );
                setState({ points: sorted, loading: false, error: null });
            })
            .catch((err: Error) => {
                if (cancelled) return;
                setState({ points: [], loading: false, error: err.message });
            });

        return () => {
            cancelled = true;
        };
    }, [namespace, fromMs, toMs]);

    return state;
}