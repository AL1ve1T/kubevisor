import type { EdgeDto, LoadLevel, NodeDto, PodPhase } from "../models";
import { NodeType } from "../models";

interface NodePopoverProps {
    node: NodeDto;
    outgoingEdges: EdgeDto[];
    incomingEdges: EdgeDto[];
    nodeMap: Map<string, NodeDto>;
    x: number;
    y: number;
    onClose: () => void;
}

const LOAD_COLOR: Record<LoadLevel, string> = {
    NORMAL: "#22c55e",
    ELEVATED: "#eab308",
    HIGH: "#f97316",
    CRITICAL: "#ef4444",
};

const POD_PHASE_COLOR: Record<PodPhase, string> = {
    RUNNING: "#22c55e",
    PENDING: "#eab308",
    NOT_READY: "#f97316",
    CRASH_LOOP: "#ef4444",
    FAILED: "#ef4444",
    UNKNOWN: "#9ca3af",
};

const NODE_TYPE_LABEL: Record<NodeType, string> = {
    [NodeType.SERVICE]: "Service",
    [NodeType.DATABASE]: "Database",
    [NodeType.CACHE]: "Cache",
    [NodeType.QUEUE]: "Queue",
    [NodeType.GATEWAY]: "Gateway",
    [NodeType.INPUT]: "Input",
};

const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "3px 0",
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
const valueStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#1f2937" };

function UtilBar({ value, color }: { value: number; color: string }) {
    const pct = Math.round(value * 100);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <div
                style={{
                    flex: 1,
                    height: 6,
                    background: "#e5e7eb",
                    borderRadius: 4,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: color,
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                    }}
                />
            </div>
            <span style={{ ...valueStyle, minWidth: 34, textAlign: "right" }}>{pct}%</span>
        </div>
    );
}

function LoadBadge({ level }: { level: LoadLevel }) {
    return (
        <span
            style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#ffffff",
                background: LOAD_COLOR[level],
                borderRadius: 4,
                padding: "1px 5px",
                letterSpacing: 0.5,
            }}
        >
            {level}
        </span>
    );
}

function EdgeRow({
    edge,
    peerName,
    direction,
}: {
    edge: EdgeDto;
    peerName: string;
    direction: "out" | "in";
}) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "16px 1fr auto auto",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
                borderBottom: "1px solid #f3f4f6",
            }}
        >
            <span style={{ fontSize: 10, color: direction === "out" ? "#f59e0b" : "#6366f1", fontWeight: 700 }}>
                {direction === "out" ? "→" : "←"}
            </span>
            <span style={{ fontSize: 12, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {peerName}
                <span style={{ marginLeft: 4, fontSize: 10, color: "#9ca3af" }}>{edge.protocol}</span>
            </span>
            <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                {edge.requestsPerSecond.toFixed(1)} rps
            </span>
            <LoadBadge level={edge.loadLevel} />
        </div>
    );
}

export function NodePopover({ node, outgoingEdges, incomingEdges, nodeMap, x, y, onClose }: NodePopoverProps) {
    const showUtil = node.type !== NodeType.INPUT;

    // CPU color ramps: green < 50%, yellow < 75%, orange < 90%, red >= 90%
    function utilColor(value: number): string {
        if (value >= 0.9) return "#ef4444";
        if (value >= 0.75) return "#f97316";
        if (value >= 0.5) return "#eab308";
        return "#22c55e";
    }

    return (
        <div
            onClick={(e) => e.stopPropagation()}
            style={{
                position: "fixed",
                left: x + 14,
                top: y - 8,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                padding: "14px 16px",
                minWidth: 260,
                maxWidth: 340,
                maxHeight: 480,
                overflowY: "auto",
                fontFamily: "Inter, system-ui, sans-serif",
                zIndex: 10,
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{node.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{NODE_TYPE_LABEL[node.type]}</div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 18,
                        color: "#9ca3af",
                        lineHeight: 1,
                        padding: 0,
                        marginLeft: 8,
                    }}
                >
                    ×
                </button>
            </div>

            {/* Pod state – only for non-INPUT nodes */}
            {showUtil && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 10,
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#ffffff",
                            background: POD_PHASE_COLOR[node.podPhase],
                            borderRadius: 5,
                            padding: "2px 7px",
                            letterSpacing: 0.4,
                        }}
                    >
                        {node.podPhase.replace("_", " ")}
                    </span>
                    {node.restartCount > 0 && (
                        <span
                            style={{
                                fontSize: 11,
                                color: node.restartCount >= 5 ? "#ef4444" : "#f97316",
                                fontWeight: 600,
                            }}
                        >
                            {node.restartCount} restart{node.restartCount !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            )}

            {/* Resource utilization */}
            {showUtil && (
                <div
                    style={{
                        background: "#f9fafb",
                        borderRadius: 8,
                        padding: "10px 12px",
                        marginBottom: 12,
                    }}
                >
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                        Resource Utilization
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>CPU</span>
                        <UtilBar value={node.cpuUtilization} color={utilColor(node.cpuUtilization)} />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Memory</span>
                        <UtilBar value={node.memoryUtilization} color={utilColor(node.memoryUtilization)} />
                    </div>
                </div>
            )}

            {/* Edges */}
            {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                        Connections ({outgoingEdges.length + incomingEdges.length})
                    </div>
                    {outgoingEdges.map((e) => (
                        <EdgeRow
                            key={e.id}
                            edge={e}
                            peerName={nodeMap.get(e.targetNodeId)?.name ?? e.targetNodeId}
                            direction="out"
                        />
                    ))}
                    {incomingEdges.map((e) => (
                        <EdgeRow
                            key={e.id}
                            edge={e}
                            peerName={nodeMap.get(e.sourceNodeId)?.name ?? e.sourceNodeId}
                            direction="in"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
