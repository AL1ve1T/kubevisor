import { useMemo } from "react";
import type { ReactNode } from "react";
import type { EdgeDto, LoadLevel, NodeDto, PodDto, PodPhase, RestartEventDto } from "../models";
import { NodeType } from "../models";
import { useNodeHistory } from "../hooks/useNodeHistory";

export interface NodeDetailModalProps {
    node: NodeDto;
    outgoingEdges: EdgeDto[];
    incomingEdges: EdgeDto[];
    nodeMap: Map<string, NodeDto>;
    namespace: string;
    onClose: () => void;
}

// ── Color maps ────────────────────────────────────────────────────────────────

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

// ── Util bar ──────────────────────────────────────────────────────────────────

// A utilization ratio of exactly 0.0 means "no fresh sample", not 0% load.
function UtilBar({ value, color }: { value: number; color: string }) {
    const hasSample = value > 0;
    const pct = Math.round(value * 100);
    // Values may momentarily exceed 1.0 (pod over its limit): clamp the bar but
    // keep showing the real number.
    const barPct = Math.min(pct, 100);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                <div
                    style={{
                        width: hasSample ? `${barPct}%` : "0%",
                        height: "100%",
                        background: color,
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                    }}
                />
            </div>
            <span
                style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: hasSample ? "#1f2937" : "#9ca3af",
                    minWidth: 34,
                    textAlign: "right",
                }}
            >
                {hasSample ? `${pct}%` : "—"}
            </span>
        </div>
    );
}

function utilColor(v: number): string {
    if (v >= 0.9) return "#ef4444";
    if (v >= 0.75) return "#f97316";
    if (v >= 0.5) return "#eab308";
    return "#22c55e";
}

// ── SVG line chart ────────────────────────────────────────────────────────────

const CW = 560;
const CH = 120;
const PL = 44;
const PR = 12;
const PT = 12;
const PB = 32;
const PW = CW - PL - PR;
const PH = CH - PT - PB;

interface Series {
    color: string;
    label: string;
    values: number[];
}

function LineChart({
    timestamps,
    series,
    yMax,
    yFormat,
    yTicks,
}: {
    timestamps: string[];
    series: Series[];
    yMax: number;
    yFormat: (v: number) => string;
    yTicks: number[];
}) {
    const n = timestamps.length;

    if (n === 0) {
        return (
            <div
                style={{
                    height: CH,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9ca3af",
                    fontSize: 13,
                }}
            >
                No historical data
            </div>
        );
    }

    const times = timestamps.map((t) => new Date(t).getTime());
    const minT = times[0];
    const maxT = times[times.length - 1];
    const tSpan = maxT === minT ? 1 : maxT - minT;
    const safeYMax = yMax > 0 ? yMax : 1;

    const xOf = (i: number) => PL + ((times[i] - minT) / tSpan) * PW;
    const yOf = (v: number) => PT + PH - Math.max(0, Math.min(v / safeYMax, 1)) * PH;

    function buildPath(values: number[]) {
        return values
            .map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
            .join(" ");
    }

    // Up to 5 evenly-distributed x-axis label indices
    const numLabels = Math.min(5, n);
    const xIdxs: number[] = n === 1
        ? [0]
        : Array.from({ length: numLabels }, (_, i) => Math.round((i * (n - 1)) / (numLabels - 1)));

    function fmtTime(ts: string) {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }

    return (
        <svg
            viewBox={`0 0 ${CW} ${CH}`}
            width="100%"
            style={{ display: "block", overflow: "visible" }}
        >
            {/* Y gridlines + labels */}
            {yTicks.map((tick) => {
                const y = yOf(tick);
                return (
                    <g key={tick}>
                        <line x1={PL} y1={y} x2={PL + PW} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                        <text x={PL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                            {yFormat(tick)}
                        </text>
                    </g>
                );
            })}

            {/* X axis baseline */}
            <line x1={PL} y1={PT + PH} x2={PL + PW} y2={PT + PH} stroke="#e5e7eb" strokeWidth={1} />

            {/* X labels */}
            {xIdxs.map((idx) => (
                <text key={idx} x={xOf(idx)} y={PT + PH + 18} textAnchor="middle" fontSize={9} fill="#9ca3af">
                    {fmtTime(timestamps[idx])}
                </text>
            ))}

            {/* Lines */}
            {series.map((s) => (
                <path
                    key={s.label}
                    d={buildPath(s.values)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            ))}

            {/* Legend (multi-series only) */}
            {series.length > 1 && (
                <g>
                    {series.map((s, i) => (
                        <g key={s.label} transform={`translate(${PL + PW - 110 + i * 55}, ${PT})`}>
                            <rect width={12} height={3} y={3} fill={s.color} rx={1} />
                            <text x={15} y={9} fontSize={9} fill="#6b7280">
                                {s.label}
                            </text>
                        </g>
                    ))}
                </g>
            )}
        </svg>
    );
}

// ── Restart timeline ──────────────────────────────────────────────────────────

const TW = 560;
const TH = 80;
const THP = 40;
const TLY = TH / 2;
const TPW = TW - THP * 2;

function reasonColor(r: string | null): string {
    if (!r) return "#9ca3af";
    const s = r.toLowerCase();
    if (s.includes("oom")) return "#ef4444";
    if (s.includes("error")) return "#f97316";
    if (s.includes("completed")) return "#22c55e";
    return "#6366f1";
}

function RestartTimeline({ restarts }: { restarts: RestartEventDto[] }) {
    if (restarts.length === 0) {
        return (
            <div
                style={{
                    height: TH,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9ca3af",
                    fontSize: 13,
                }}
            >
                No restarts recorded
            </div>
        );
    }

    const times = restarts.map((r) => new Date(r.detectedAt).getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const tSpan = maxT === minT ? 1 : maxT - minT;

    const xOf = (ts: string) => THP + ((new Date(ts).getTime() - minT) / tSpan) * TPW;

    function fmtLabel(ts: string) {
        const d = new Date(ts);
        return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }

    return (
        <svg
            viewBox={`0 0 ${TW} ${TH}`}
            width="100%"
            style={{ display: "block", overflow: "visible" }}
        >
            {/* Baseline */}
            <line x1={THP} y1={TLY} x2={THP + TPW} y2={TLY} stroke="#e5e7eb" strokeWidth={2} />
            <circle cx={THP} cy={TLY} r={3} fill="#e5e7eb" />
            {/* Arrow */}
            <polygon
                points={`${THP + TPW + 6},${TLY} ${THP + TPW},${TLY - 4} ${THP + TPW},${TLY + 4}`}
                fill="#e5e7eb"
            />

            {restarts.map((r, i) => {
                const x = xOf(r.detectedAt);
                const above = i % 2 === 0;
                const color = reasonColor(r.reason);
                return (
                    <g key={i}>
                        <line
                            x1={x}
                            y1={TLY}
                            x2={x}
                            y2={above ? TLY - 6 : TLY + 6}
                            stroke={color}
                            strokeWidth={1.5}
                        />
                        <circle cx={x} cy={TLY} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
                        <text
                            x={x}
                            y={above ? TLY - 14 : TLY + 22}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight={700}
                            fill={color}
                        >
                            {r.reason ?? "Restart"}
                        </text>
                        <text
                            x={x}
                            y={above ? TLY - 24 : TLY + 32}
                            textAnchor="middle"
                            fontSize={8}
                            fill="#9ca3af"
                        >
                            {fmtLabel(r.detectedAt)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── Chart section wrapper ─────────────────────────────────────────────────────

function ChartSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 8,
                }}
            >
                {title}
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px" }}>
                {children}
            </div>
        </div>
    );
}

// ── Edge row ──────────────────────────────────────────────────────────────────

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
            <span
                style={{
                    fontSize: 10,
                    color: direction === "out" ? "#f59e0b" : "#6366f1",
                    fontWeight: 700,
                }}
            >
                {direction === "out" ? "→" : "←"}
            </span>
            <span
                style={{
                    fontSize: 12,
                    color: "#374151",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
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

// ── Pod panel (expanded replica-set view) ─────────────────────────────────────

function PodPhaseBadge({ phase }: { phase: PodPhase }) {
    return (
        <span
            style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#ffffff",
                background: POD_PHASE_COLOR[phase],
                borderRadius: 4,
                padding: "1px 6px",
                letterSpacing: 0.4,
                whiteSpace: "nowrap",
            }}
        >
            {phase.replace("_", " ")}
        </span>
    );
}

function fmtRestartAt(iso: string): string {
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return iso;
    const d = new Date(ms);
    const date = `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
    const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    return `${date} ${time}`;
}

function PodRow({ pod }: { pod: PodDto }) {
    return (
        <div
            style={{
                background: "#ffffff",
                border: "1px solid #f3f4f6",
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 6,
            }}
        >
            {/* Pod header: name + phase + restarts */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#111827",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                    }}
                    title={pod.podName}
                >
                    {pod.podName}
                </span>
                <PodPhaseBadge phase={pod.podPhase} />
                {pod.restartCount > 0 && (
                    <span
                        style={{
                            fontSize: 11,
                            color: pod.restartCount >= 5 ? "#ef4444" : "#f97316",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {pod.restartCount} restart{pod.restartCount !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {/* CPU / memory bars — pods carry resource & health only, never traffic */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "2px 0" }}>
                <span style={{ fontSize: 11, color: "#6b7280", minWidth: 48 }}>CPU</span>
                <UtilBar value={pod.cpuUtilization} color={utilColor(pod.cpuUtilization)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "2px 0" }}>
                <span style={{ fontSize: 11, color: "#6b7280", minWidth: 48 }}>Memory</span>
                <UtilBar value={pod.memoryUtilization} color={utilColor(pod.memoryUtilization)} />
            </div>

            {/* Last restart context */}
            {(pod.lastRestartReason || pod.lastRestartAt) && (
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
                    {pod.lastRestartReason && (
                        <span style={{ color: reasonColor(pod.lastRestartReason), fontWeight: 600 }}>
                            {pod.lastRestartReason}
                        </span>
                    )}
                    {pod.lastRestartReason && pod.lastRestartAt && <span> · </span>}
                    {pod.lastRestartAt && <span>{fmtRestartAt(pod.lastRestartAt)}</span>}
                </div>
            )}
        </div>
    );
}

function PodPanel({ node }: { node: NodeDto }) {
    // history snapshots may have pods === null/undefined: treat as empty.
    const pods = node.pods ?? [];

    // podCount === 0 and no pods ⇒ synthetic node / scraper not running: no panel.
    if (node.podCount === 0 && pods.length === 0) {
        return null;
    }

    // Don't rely on backend ordering; sort by podName. Copy so we never mutate.
    const sorted = [...pods].sort((a, b) => a.podName.localeCompare(b.podName));

    return (
        <div style={{ marginBottom: 20 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                    }}
                >
                    Pods ({node.podCount})
                </span>
                {node.podCount > 1 && (
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#6366f1",
                            background: "#eef2ff",
                            borderRadius: 4,
                            padding: "1px 6px",
                            letterSpacing: 0.3,
                        }}
                    >
                        MULTI-REPLICA
                    </span>
                )}
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 10px 4px" }}>
                {sorted.length > 0 ? (
                    sorted.map((pod) => <PodRow key={pod.podName} pod={pod} />)
                ) : (
                    <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 2px 10px" }}>
                        No pod-level data available.
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function NodeDetailModal({
    node,
    outgoingEdges,
    incomingEdges,
    nodeMap,
    namespace,
    onClose,
}: NodeDetailModalProps) {
    const showUtil = node.type !== NodeType.INPUT;
    const { points, restarts, loading, error } = useNodeHistory(node.id, namespace);

    const timestamps = useMemo(() => points.map((p) => p.timestamp), [points]);

    const utilSeries = useMemo<Series[]>(
        () => [
            { color: "#6366f1", label: "CPU", values: points.map((p) => p.cpuUtilization) },
            { color: "#22c55e", label: "RAM", values: points.map((p) => p.memoryUtilization) },
        ],
        [points],
    );

    const rpsSeries = useMemo<Series[]>(
        () => [{ color: "#f59e0b", label: "RPS", values: points.map((p) => p.totalRps) }],
        [points],
    );

    const rpsMax = useMemo(() => {
        const max = Math.max(1, ...points.map((p) => p.totalRps));
        return Math.ceil(max * 1.1);
    }, [points]);

    return (
        /* Overlay */
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
            onClick={onClose}
        >
            {/* Panel */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#ffffff",
                    borderRadius: 14,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                    padding: "20px 24px",
                    width: 680,
                    maxWidth: "calc(100vw - 40px)",
                    maxHeight: "calc(100vh - 60px)",
                    overflowY: "auto",
                    fontFamily: "Inter, system-ui, sans-serif",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 14,
                    }}
                >
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{node.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                            {NODE_TYPE_LABEL[node.type]}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 22,
                            color: "#9ca3af",
                            lineHeight: 1,
                            padding: 0,
                            marginLeft: 8,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Pod state */}
                {showUtil && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
                        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                            ×{node.podCount} {node.podCount === 1 ? "replica" : "replicas"}
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
                        {(node.lastRestartReason || node.lastRestartAt) && (
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                last:{" "}
                                {node.lastRestartReason && (
                                    <span style={{ color: reasonColor(node.lastRestartReason), fontWeight: 600 }}>
                                        {node.lastRestartReason}
                                    </span>
                                )}
                                {node.lastRestartReason && node.lastRestartAt && <span> · </span>}
                                {node.lastRestartAt && <span>{fmtRestartAt(node.lastRestartAt)}</span>}
                            </span>
                        )}
                    </div>
                )}

                {/* Per-pod replica metrics (resource & health only — never traffic) */}
                {showUtil && <PodPanel node={node} />}

                {/* History charts */}
                {loading ? (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 80,
                            color: "#9ca3af",
                            fontSize: 13,
                        }}
                    >
                        Loading history…
                    </div>
                ) : error ? (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 80,
                            color: "#ef4444",
                            fontSize: 12,
                        }}
                    >
                        {error}
                    </div>
                ) : (
                    <>
                        <ChartSection title="Restart Timeline">
                            <RestartTimeline restarts={restarts} />
                        </ChartSection>

                        {showUtil && (
                            <ChartSection title="Peak Replica CPU & Memory">
                                <LineChart
                                    timestamps={timestamps}
                                    series={utilSeries}
                                    yMax={1}
                                    yFormat={(v) => `${Math.round(v * 100)}%`}
                                    yTicks={[0, 0.25, 0.5, 0.75, 1]}
                                />
                            </ChartSection>
                        )}

                        <ChartSection title="Requests Per Second">
                            <LineChart
                                timestamps={timestamps}
                                series={rpsSeries}
                                yMax={rpsMax}
                                yFormat={(v) => v.toFixed(1)}
                                yTicks={[0, rpsMax / 2, rpsMax]}
                            />
                        </ChartSection>
                    </>
                )}

                {/* Connections */}
                {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
                    <div>
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#6b7280",
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                marginBottom: 6,
                            }}
                        >
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
        </div>
    );
}
