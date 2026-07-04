import type { TopologyStrategy } from "../strategies";

interface ControlPanelProps {
    /** Topology strategy selection */
    strategies: TopologyStrategy[];
    activeStrategyId: string;
    onStrategyChange: (id: string) => void;
    /** Namespace selection */
    namespaces: string[];
    selectedNamespace: string | null;
    onNamespaceChange: (ns: string) => void;
    /** Connection status */
    status: string;
    lastRefreshText: string;
    /** Edge visibility */
    showInactiveEdges: boolean;
    onToggleInactiveEdges: () => void;
}

const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
};

const divider: React.CSSProperties = {
    borderTop: "1px solid #1f2937",
    margin: "12px 0",
};

export function ControlPanel({
    strategies,
    activeStrategyId,
    onStrategyChange,
    namespaces,
    selectedNamespace,
    onNamespaceChange,
    status,
    lastRefreshText,
    showInactiveEdges,
    onToggleInactiveEdges,
}: ControlPanelProps) {
    const statusColor = status === "live" ? "#22c55e" : status === "error" ? "#ef4444" : "#f59e0b";

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: 220,
                zIndex: 20,
                background: "#111827",
                borderRight: "1px solid #1f2937",
                display: "flex",
                flexDirection: "column",
                fontFamily: "Inter, system-ui, sans-serif",
                boxShadow: "2px 0 12px rgba(0,0,0,0.18)",
                overflowY: "auto",
            }}
        >
            {/* Branding header */}
            <div
                style={{
                    padding: "16px 16px 14px",
                    borderBottom: "1px solid #1f2937",
                }}
            >
                <div style={{ fontSize: 15, fontWeight: 800, color: "#f9fafb", letterSpacing: 0.3 }}>
                    KubeTopo
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    service topology
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: "14px 14px 16px" }}>

                {/* Namespace section */}
                {namespaces.length > 0 && (
                    <>
                        <div style={sectionLabel}>Namespace</div>
                        {namespaces.length === 1 ? (
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#e5e7eb",
                                    padding: "6px 10px",
                                    background: "#1f2937",
                                    borderRadius: 6,
                                    border: "1px solid #374151",
                                }}
                            >
                                {namespaces[0]}
                            </div>
                        ) : (
                            <select
                                value={selectedNamespace ?? ""}
                                onChange={(e) => onNamespaceChange(e.target.value)}
                                style={{
                                    width: "100%",
                                    fontSize: 12,
                                    fontFamily: "Inter, system-ui, sans-serif",
                                    background: "#1f2937",
                                    color: "#e5e7eb",
                                    border: "1px solid #374151",
                                    borderRadius: 6,
                                    padding: "6px 8px",
                                    cursor: "pointer",
                                    outline: "none",
                                }}
                            >
                                {namespaces.map((ns) => (
                                    <option key={ns} value={ns}>{ns}</option>
                                ))}
                            </select>
                        )}
                        <div style={divider} />
                    </>
                )}

                {/* Topology strategy section */}
                <div style={sectionLabel}>Topology Layout</div>                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {strategies.map((strategy) => {
                        const isActive = strategy.id === activeStrategyId;
                        return (
                            <button
                                key={strategy.id}
                                title={strategy.description}
                                disabled={isActive}
                                onClick={() => onStrategyChange(strategy.id)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "7px 10px",
                                    background: isActive ? "#1e3a5f" : "transparent",
                                    border: isActive ? "1px solid #3b82f6" : "1px solid #374151",
                                    borderRadius: 6,
                                    cursor: isActive ? "default" : "pointer",
                                    textAlign: "left",
                                    width: "100%",
                                    transition: "background 0.15s, border-color 0.15s",
                                }}
                            >
                                <span
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: isActive ? "#60a5fa" : "#4b5563",
                                        flexShrink: 0,
                                    }}
                                />
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: isActive ? 600 : 400,
                                        color: isActive ? "#bfdbfe" : "#9ca3af",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {strategy.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div style={divider} />

                {/* Inactive edge toggle */}
                <button
                    onClick={onToggleInactiveEdges}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "7px 10px",
                        background: "transparent",
                        border: "1px solid #374151",
                        borderRadius: 6,
                        cursor: "pointer",
                        marginBottom: 8,
                    }}
                >
                    <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "Inter, system-ui, sans-serif" }}>
                        Inactive edges
                    </span>
                    {/* Toggle pill */}
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            width: 32,
                            height: 18,
                            borderRadius: 9,
                            background: showInactiveEdges ? "#3b82f6" : "#374151",
                            transition: "background 0.2s",
                            padding: "0 2px",
                            flexShrink: 0,
                        }}
                    >
                        <span
                            style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                background: "#f9fafb",
                                transform: showInactiveEdges ? "translateX(14px)" : "translateX(0)",
                                transition: "transform 0.2s",
                            }}
                        />
                    </span>
                </button>

                {/* Visual encoding legend */}
                <div style={sectionLabel}>Edge Legend</div>

                {/* Width = traffic */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                        Width &mdash; traffic (req/s, relative)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {([["low", 1.5], ["medium", 4], ["high", 8]] as [string, number][]).map(([label, w]) => (
                            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <svg width={36} height={w + 2} style={{ flexShrink: 0 }}>
                                    <line x1={2} y1={(w + 2) / 2} x2={34} y2={(w + 2) / 2}
                                        stroke="#e5e7eb" strokeWidth={w} strokeLinecap="round" />
                                </svg>
                                <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Color = health */}
                <div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                        Color &mdash; health (errors + CPU/RAM)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {([
                            ["#9ca3af", "No traffic"],
                            ["#22c55e", "Healthy"],
                            ["#eab308", "Elevated"],
                            ["#f97316", "High load"],
                            ["#ef4444", "Critical / errors"],
                        ] as [string, string][]).map(([color, label]) => (
                            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: "50%",
                                    background: color, flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer: connection status */}
            <div
                style={{
                    padding: "10px 14px",
                    borderTop: "1px solid #1f2937",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                        style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: statusColor,
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "capitalize" }}>
                        {status}
                    </span>
                </div>
                <div style={{ fontSize: 10, color: "#4b5563" }}>
                    Last refresh: {lastRefreshText}
                </div>
            </div>
        </div>
    );
}

