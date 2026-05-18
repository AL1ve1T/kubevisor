import { useEffect, useMemo, useState } from "react";
import { TopologyCanvas } from "./components/TopologyCanvas";
import { ControlPanel } from "./components/ControlPanel";
import { useGraphSubscription } from "./hooks/useGraphSubscription";
import { formatTimeAgo } from "./helpers/timeAgo";
import { DEFAULT_STRATEGY_ID, TOPOLOGY_STRATEGIES } from "./strategies";
import { mockSnapshot } from "./data/mockSnapshot";

const USE_MOCK = false;

export function App() {
    const { snapshots: liveSnapshots, lastRefreshAt, status, error } = useGraphSubscription();
    const snapshots = USE_MOCK ? [mockSnapshot] : liveSnapshots;
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
    const [strategyId, setStrategyId] = useState(DEFAULT_STRATEGY_ID);

    useEffect(() => {
        const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const namespaces = useMemo(
        () => snapshots.map((s) => s.namespace),
        [snapshots],
    );

    // Auto-select first namespace when data arrives
    useEffect(() => {
        if (selectedNamespace === null && namespaces.length > 0) {
            setSelectedNamespace(namespaces[0]);
        }
    }, [namespaces, selectedNamespace]);

    const activeSnapshot = useMemo(
        () => snapshots.find((s) => s.namespace === selectedNamespace) ?? null,
        [snapshots, selectedNamespace],
    );

    const lastRefreshText = useMemo(() => {
        if (!lastRefreshAt) return "never";
        return formatTimeAgo(lastRefreshAt, clockNow);
    }, [lastRefreshAt, clockNow]);

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                background: "#ffffff",
                overflow: "hidden",
                position: "relative",
                display: "flex",
            }}
        >
            <ControlPanel
                strategies={TOPOLOGY_STRATEGIES}
                activeStrategyId={strategyId}
                onStrategyChange={setStrategyId}
                namespaces={namespaces}
                selectedNamespace={selectedNamespace}
                onNamespaceChange={setSelectedNamespace}
                status={status}
                lastRefreshText={lastRefreshText}
            />

            {/* Canvas area offset by sidebar width */}
            <div style={{ flex: 1, position: "relative", marginLeft: 220 }}>
                {activeSnapshot ? (
                    <TopologyCanvas snapshot={activeSnapshot} strategyId={strategyId} />
                ) : (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            color: "#6b7280",
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: 14,
                        }}
                    >
                        Waiting for graph snapshot...
                    </div>
                )}
            </div>

            {error && (
                <div
                    style={{
                        position: "absolute",
                        left: 232,
                        bottom: 12,
                        zIndex: 20,
                        background: "rgba(254,242,242,0.95)",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: 12,
                        color: "#b91c1c",
                        maxWidth: 520,
                    }}
                >
                    {error}
                </div>
            )}
        </div>
    );
}
