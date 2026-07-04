import { useEffect, useRef, useState } from "react";
import type { SampleCluster } from "./sampleClusters";

interface ClusterYamlEditorProps {
    open: boolean;
    initialYaml: string;
    samples: SampleCluster[];
    onApply: (yaml: string) => void;
    onClose: () => void;
}

const mono =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
const sans = "Inter, system-ui, sans-serif";

/**
 * Modal for choosing or pasting the cluster manifests to visualise. Accepts raw
 * multi-document `kubectl` YAML by paste, file upload, or a bundled sample.
 */
export function ClusterYamlEditor({ open, initialYaml, samples, onApply, onClose }: ClusterYamlEditorProps) {
    const [text, setText] = useState(initialYaml);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) setText(initialYaml);
    }, [open, initialYaml]);

    if (!open) return null;

    const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setText(String(reader.result ?? ""));
        reader.readAsText(file);
        event.target.value = "";
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                background: "rgba(17,24,39,0.62)",
                display: "grid",
                placeItems: "center",
                fontFamily: sans,
            }}
            onClick={onClose}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: "min(760px, 92vw)",
                    maxHeight: "86vh",
                    display: "flex",
                    flexDirection: "column",
                    background: "#0f172a",
                    border: "1px solid #1f2937",
                    borderRadius: 12,
                    boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
                    overflow: "hidden",
                }}
            >
                <div style={{ padding: "16px 18px", borderBottom: "1px solid #1f2937" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>
                        Choose a cluster
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                        Paste your own <code style={{ fontFamily: mono }}>kubectl</code> YAML, upload a
                        file, or start from a sample. Dependencies are inferred from each workload's
                        environment (Service URLs, <code style={{ fontFamily: mono }}>DB_HOST</code>, …).
                    </div>
                </div>

                <div style={{ padding: "12px 18px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                        Samples
                    </span>
                    {samples.map((sample) => (
                        <button
                            key={sample.id}
                            onClick={() => setText(sample.yaml)}
                            title={sample.description}
                            style={pillButton}
                        >
                            {sample.label}
                        </button>
                    ))}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => fileInputRef.current?.click()} style={pillButton}>
                        Upload .yaml
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".yaml,.yml,.txt,text/yaml"
                        onChange={handleFile}
                        style={{ display: "none" }}
                    />
                </div>

                <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    spellCheck={false}
                    style={{
                        flex: 1,
                        minHeight: 320,
                        resize: "none",
                        margin: "0 18px",
                        padding: 12,
                        background: "#020617",
                        color: "#e2e8f0",
                        border: "1px solid #1f2937",
                        borderRadius: 8,
                        fontFamily: mono,
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        outline: "none",
                        whiteSpace: "pre",
                        overflow: "auto",
                    }}
                />

                <div
                    style={{
                        padding: "14px 18px",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 10,
                        borderTop: "1px solid #1f2937",
                        marginTop: 14,
                    }}
                >
                    <button onClick={onClose} style={{ ...pillButton, background: "transparent" }}>
                        Cancel
                    </button>
                    <button
                        onClick={() => onApply(text)}
                        style={{
                            ...pillButton,
                            background: "#1e40af",
                            borderColor: "#1e40af",
                            color: "#fff",
                            fontWeight: 700,
                            padding: "8px 18px",
                        }}
                    >
                        Render cluster
                    </button>
                </div>
            </div>
        </div>
    );
}

const pillButton: React.CSSProperties = {
    fontFamily: sans,
    fontSize: 12,
    color: "#e5e7eb",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: 6,
    padding: "6px 12px",
    cursor: "pointer",
};
