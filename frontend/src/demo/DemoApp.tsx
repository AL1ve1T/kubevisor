import { useEffect, useMemo, useState } from "react";
import { TopologyCanvas } from "../components/TopologyCanvas";
import { TimelineScrubber } from "../components/TimelineScrubber";
import { NodeType } from "../models";
import { DEFAULT_STRATEGY_ID, TOPOLOGY_STRATEGIES } from "../strategies";
import { DemoControlPanel, type DemoServiceRef } from "./DemoControlPanel";
import { ClusterYamlEditor } from "./ClusterYamlEditor";
import { parseClusterYaml } from "./kubeParser";
import { buildTopology } from "./topology";
import { useDemoSimulation } from "./useDemoSimulation";
import { DEFAULT_SAMPLE_ID, SAMPLE_CLUSTERS } from "./sampleClusters";
import type { DemandLevel, LoadConfig, LoadMode } from "./loadSimulator";

const SIDEBAR_WIDTH = 240;

function sampleYaml(id: string): string {
    return (SAMPLE_CLUSTERS.find((sample) => sample.id === id) ?? SAMPLE_CLUSTERS[0]).yaml;
}

/**
 * Standalone, backend-free demo of KubeVisor. The user supplies (or picks) raw
 * Kubernetes manifests; the browser parses them, infers a service-communication
 * topology, and continuously synthesises backend-shaped graph snapshots under a
 * chosen load profile — all rendered through the exact same topology canvas and
 * timeline scrubber as the live product.
 */
export function DemoApp() {
    const [yamlText, setYamlText] = useState<string>(() => sampleYaml(DEFAULT_SAMPLE_ID));
    const [activeSampleId, setActiveSampleId] = useState<string>(DEFAULT_SAMPLE_ID);
    const [editorOpen, setEditorOpen] = useState(false);

    const [strategyId, setStrategyId] = useState(DEFAULT_STRATEGY_ID);
    const [mode, setMode] = useState<LoadMode>("scenario");
    const [intensity, setIntensity] = useState(1);
    const [manualLevels, setManualLevels] = useState<Record<string, DemandLevel>>({});
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [showInactiveEdges, setShowInactiveEdges] = useState(true);
    const [scrubIndex, setScrubIndex] = useState<number | null>(null);

    const parsed = useMemo(() => parseClusterYaml(yamlText), [yamlText]);
    const topology = useMemo(() => buildTopology(parsed), [parsed]);
    const hasWorkloads = parsed.workloads.length > 0;

    const serviceNodes = useMemo<DemoServiceRef[]>(
        () =>
            topology.nodes
                .filter((node) => node.type === NodeType.SERVICE || node.type === NodeType.GATEWAY)
                .map((node) => ({ id: node.id, name: node.name, type: node.type })),
        [topology],
    );

    // Keep manual levels in sync with the current set of services.
    const serviceIdsKey = topology.serviceNodeIds.join("|");
    useEffect(() => {
        setManualLevels((prev) => {
            const next: Record<string, DemandLevel> = {};
            for (const id of topology.serviceNodeIds) next[id] = prev[id] ?? "NORMAL";
            return next;
        });
        setScrubIndex(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceIdsKey]);

    const config = useMemo<LoadConfig>(
        () => ({ mode, intensity, manualLevels }),
        [mode, intensity, manualLevels],
    );

    const { liveSnapshot, history, timelinePoints, windowStartMs, windowEndMs } = useDemoSimulation(
        topology,
        config,
        playing,
        speed,
    );

    const activeSnapshot =
        scrubIndex !== null ? history[scrubIndex] ?? liveSnapshot : liveSnapshot;

    const applyYaml = (text: string) => {
        setYamlText(text);
        const match = SAMPLE_CLUSTERS.find((sample) => sample.yaml === text);
        setActiveSampleId(match ? match.id : "custom");
        setEditorOpen(false);
        setScrubIndex(null);
    };

    const selectSample = (id: string) => {
        if (id === "custom") return;
        setYamlText(sampleYaml(id));
        setActiveSampleId(id);
        setScrubIndex(null);
    };

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
            <DemoControlPanel
                namespace={topology.namespace}
                workloadCount={parsed.workloads.length}
                warnings={parsed.warnings}
                samples={SAMPLE_CLUSTERS}
                activeSampleId={activeSampleId}
                onSelectSample={selectSample}
                onEditYaml={() => setEditorOpen(true)}
                strategies={TOPOLOGY_STRATEGIES}
                activeStrategyId={strategyId}
                onStrategyChange={setStrategyId}
                mode={mode}
                onModeChange={setMode}
                intensity={intensity}
                onIntensityChange={setIntensity}
                playing={playing}
                onTogglePlay={() => setPlaying((value) => !value)}
                speed={speed}
                onSpeedChange={setSpeed}
                serviceNodes={serviceNodes}
                manualLevels={manualLevels}
                onLevelChange={(nodeId, level) =>
                    setManualLevels((prev) => ({ ...prev, [nodeId]: level }))
                }
                showInactiveEdges={showInactiveEdges}
                onToggleInactiveEdges={() => setShowInactiveEdges((value) => !value)}
            />

            <div style={{ flex: 1, position: "relative", marginLeft: SIDEBAR_WIDTH }}>
                {hasWorkloads ? (
                    <TopologyCanvas
                        snapshot={activeSnapshot}
                        strategyId={strategyId}
                        showInactiveEdges={showInactiveEdges}
                    />
                ) : (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            color: "#6b7280",
                            fontFamily: "Inter, system-ui, sans-serif",
                            textAlign: "center",
                            padding: 24,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>
                                No workloads found
                            </div>
                            <div style={{ fontSize: 13, marginTop: 6, maxWidth: 360 }}>
                                {parsed.warnings[0] ??
                                    "Paste Kubernetes manifests with at least one Deployment or StatefulSet."}
                            </div>
                            <button
                                onClick={() => setEditorOpen(true)}
                                style={{
                                    marginTop: 14,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#fff",
                                    background: "#1e40af",
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "8px 16px",
                                    cursor: "pointer",
                                }}
                            >
                                Choose a cluster
                            </button>
                        </div>
                    </div>
                )}

                {hasWorkloads && (
                    <TimelineScrubber
                        historySnapshots={history}
                        timelinePoints={timelinePoints}
                        selectedIndex={scrubIndex}
                        onSelect={setScrubIndex}
                        onRefresh={() => setScrubIndex(null)}
                        loading={false}
                        timelineError={null}
                        windowStartMs={windowStartMs}
                        windowEndMs={windowEndMs}
                    />
                )}
            </div>

            <ClusterYamlEditor
                open={editorOpen}
                initialYaml={yamlText}
                samples={SAMPLE_CLUSTERS}
                onApply={applyYaml}
                onClose={() => setEditorOpen(false)}
            />
        </div>
    );
}
