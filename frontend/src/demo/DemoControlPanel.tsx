import type { TopologyStrategy } from "../strategies";
import type { NodeType } from "../models";
import type { SampleCluster } from "./sampleClusters";
import { DEMAND_LEVELS, type DemandLevel, type LoadMode } from "./loadSimulator";

export interface DemoServiceRef {
    id: string;
    name: string;
    type: NodeType;
}

interface DemoControlPanelProps {
    namespace: string;
    workloadCount: number;
    warnings: string[];

    samples: SampleCluster[];
    activeSampleId: string;
    onSelectSample: (id: string) => void;
    onEditYaml: () => void;

    strategies: TopologyStrategy[];
    activeStrategyId: string;
    onStrategyChange: (id: string) => void;

    mode: LoadMode;
    onModeChange: (mode: LoadMode) => void;
    intensity: number;
    onIntensityChange: (value: number) => void;

    playing: boolean;
    onTogglePlay: () => void;
    speed: number;
    onSpeedChange: (value: number) => void;

    serviceNodes: DemoServiceRef[];
    manualLevels: Record<string, DemandLevel>;
    onLevelChange: (nodeId: string, level: DemandLevel) => void;

    showInactiveEdges: boolean;
    onToggleInactiveEdges: () => void;
}

const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    margin: "0 0 6px",
};

const divider: React.CSSProperties = { borderTop: "1px solid #1f2937", margin: "14px 0" };

const selectStyle: React.CSSProperties = {
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
};

const LEVEL_COLOR: Record<DemandLevel, string> = {
    IDLE: "#9ca3af",
    NORMAL: "#22c55e",
    ELEVATED: "#eab308",
    HIGH: "#f97316",
    CRITICAL: "#ef4444",
};

const LOAD_MODES: { value: LoadMode; label: string }[] = [
    { value: "scenario", label: "Load test" },
    { value: "manual", label: "Manual" },
];

export function DemoControlPanel(props: DemoControlPanelProps) {
    const speeds = [0.5, 1, 2, 4];

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: 240,
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
            <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid #1f2937" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#f9fafb", letterSpacing: 0.3 }}>
                    KubeTopo
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>interactive demo</div>
            </div>

            <div style={{ flex: 1, padding: "14px 14px 18px" }}>
                {/* Cluster */}
                <div style={sectionLabel}>Cluster</div>
                <select
                    value={props.activeSampleId}
                    onChange={(event) => props.onSelectSample(event.target.value)}
                    style={selectStyle}
                >
                    {props.samples.map((sample) => (
                        <option key={sample.id} value={sample.id}>
                            {sample.label}
                        </option>
                    ))}
                    {!props.samples.some((s) => s.id === props.activeSampleId) && (
                        <option value={props.activeSampleId}>Custom YAML</option>
                    )}
                </select>
                <button
                    onClick={props.onEditYaml}
                    style={{
                        width: "100%",
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#bfdbfe",
                        background: "#172554",
                        border: "1px solid #1e3a8a",
                        borderRadius: 6,
                        padding: "7px 8px",
                        cursor: "pointer",
                    }}
                >
                    Paste / upload YAML…
                </button>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                    Namespace <strong style={{ color: "#e5e7eb" }}>{props.namespace}</strong> ·{" "}
                    {props.workloadCount} workloads
                </div>
                {props.warnings.length > 0 && (
                    <div
                        style={{
                            marginTop: 8,
                            fontSize: 10.5,
                            lineHeight: 1.45,
                            color: "#fcd34d",
                            background: "rgba(120,53,15,0.35)",
                            border: "1px solid #92400e",
                            borderRadius: 6,
                            padding: "6px 8px",
                        }}
                    >
                        {props.warnings.map((warning, index) => (
                            <div key={index}>• {warning}</div>
                        ))}
                    </div>
                )}

                <div style={divider} />

                {/* Layout */}
                <div style={sectionLabel}>Layout</div>
                <select
                    value={props.activeStrategyId}
                    onChange={(event) => props.onStrategyChange(event.target.value)}
                    style={selectStyle}
                >
                    {props.strategies.map((strategy) => (
                        <option key={strategy.id} value={strategy.id}>
                            {strategy.label}
                        </option>
                    ))}
                </select>

                <div style={divider} />

                {/* Load */}
                <div style={sectionLabel}>Load</div>
                <div style={{ display: "flex", gap: 6 }}>
                    {LOAD_MODES.map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => props.onModeChange(value)}
                            style={{
                                flex: 1,
                                fontSize: 12,
                                fontWeight: 600,
                                color: props.mode === value ? "#fff" : "#9ca3af",
                                background: props.mode === value ? "#1e40af" : "#1f2937",
                                border: "1px solid",
                                borderColor: props.mode === value ? "#1e40af" : "#374151",
                                borderRadius: 6,
                                padding: "6px 0",
                                cursor: "pointer",
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {props.mode === "scenario" && (
                    <div style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.45, color: "#94a3b8" }}>
                        Traffic ramps up, holds at peak, then a service degrades into an outage and
                        recovers. Scrub the timeline to pinpoint <em>when</em> and <em>where</em>.
                    </div>
                )}

                <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af" }}>
                        <span>Intensity</span>
                        <span style={{ color: "#e5e7eb" }}>{props.intensity.toFixed(1)}×</span>
                    </div>
                    <input
                        type="range"
                        min={0.2}
                        max={2}
                        step={0.1}
                        value={props.intensity}
                        onChange={(event) => props.onIntensityChange(Number(event.target.value))}
                        style={{ width: "100%", marginTop: 4, accentColor: "#3b82f6" }}
                    />
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                        onClick={props.onTogglePlay}
                        style={{
                            flex: 1,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#fff",
                            background: props.playing ? "#374151" : "#16a34a",
                            border: "1px solid",
                            borderColor: props.playing ? "#4b5563" : "#16a34a",
                            borderRadius: 6,
                            padding: "7px 0",
                            cursor: "pointer",
                        }}
                    >
                        {props.playing ? "Pause" : "Play"}
                    </button>
                    <select
                        value={props.speed}
                        onChange={(event) => props.onSpeedChange(Number(event.target.value))}
                        style={{ ...selectStyle, width: 70 }}
                    >
                        {speeds.map((speed) => (
                            <option key={speed} value={speed}>
                                {speed}×
                            </option>
                        ))}
                    </select>
                </div>

                {props.mode === "manual" && (
                    <div style={{ marginTop: 14 }}>
                        <div style={sectionLabel}>Service load</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {props.serviceNodes.map((node) => {
                                const level = props.manualLevels[node.id] ?? "NORMAL";
                                return (
                                    <div key={node.id}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                fontSize: 11,
                                                color: "#cbd5e1",
                                                marginBottom: 3,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: "50%",
                                                    background: LEVEL_COLOR[level],
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span
                                                style={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                                title={node.name}
                                            >
                                                {node.name}
                                            </span>
                                        </div>
                                        <select
                                            value={level}
                                            onChange={(event) =>
                                                props.onLevelChange(node.id, event.target.value as DemandLevel)
                                            }
                                            style={{ ...selectStyle, padding: "4px 8px" }}
                                        >
                                            {DEMAND_LEVELS.map((demandLevel) => (
                                                <option key={demandLevel} value={demandLevel}>
                                                    {demandLevel}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div style={divider} />

                {/* Display */}
                <div style={sectionLabel}>Display</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1", cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={props.showInactiveEdges}
                        onChange={props.onToggleInactiveEdges}
                        style={{ accentColor: "#3b82f6" }}
                    />
                    Show idle edges
                </label>

                <div style={divider} />

                {/* Edge legend — matches the live app's visual encoding */}
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
                                    <line
                                        x1={2}
                                        y1={(w + 2) / 2}
                                        x2={34}
                                        y2={(w + 2) / 2}
                                        stroke="#e5e7eb"
                                        strokeWidth={w}
                                        strokeLinecap="round"
                                    />
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
                                <span
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: "50%",
                                        background: color,
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
