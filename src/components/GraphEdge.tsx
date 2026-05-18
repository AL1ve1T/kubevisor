interface Position {
    x: number;
    y: number;
}

interface GraphEdgeProps {
    routeId: string;
    path: string;
    end: Position;
    color: string;
    width: number;
    rps: number;
    showEndDot: boolean;
    hubTint?: "out" | "in" | null;
    highlighted?: boolean;
}

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, value));
}

function adjustColor(hex: string, mixTo: number, ratio: number): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const nr = clampChannel(Math.round(r + (mixTo - r) * ratio));
    const ng = clampChannel(Math.round(g + (mixTo - g) * ratio));
    const nb = clampChannel(Math.round(b + (mixTo - b) * ratio));
    return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

function darkenColor(hex: string, ratio: number): string {
    return adjustColor(hex, 0, ratio);
}

function lightenColor(hex: string, ratio: number): string {
    return adjustColor(hex, 255, ratio);
}

/** Dash period in pixels (dash + gap). Shorter = denser. */
const DASH_PERIOD = 52;

/**
 * Animation duration in seconds. Higher RPS = faster flow.
 * Idle (rps=0) flows slowly to show the path; active flows faster.
 */
function flowDuration(rps: number): number {
    if (rps === 0) return 4;
    if (rps < 5) return 3;
    if (rps < 20) return 1.8;
    if (rps < 40) return 1.1;
    return 0.7;
}

export function GraphEdge({ routeId, path, end, color, width, rps, showEndDot, hubTint, highlighted }: GraphEdgeProps) {
    const outerColor = darkenColor(color, 0.3);
    const innerColor = lightenColor(color, 0.42);
    const coreWidth = Math.max(2, width * 0.6);
    const dotRadius = Math.max(3, width * 0.55);
    const tintColor = hubTint === "out" ? "#f59e0b" : hubTint === "in" ? "#6366f1" : null;
    const duration = flowDuration(rps);

    // Sanitize routeId for use as a CSS identifier (edge IDs like "a->b" contain invalid chars)
    const animId = `flow-${routeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    // Large gap so bubbles are clearly separated even when edges overlap
    const dashGap = Math.max(20, width * 2.0);
    const dashLen = Math.max(10, DASH_PERIOD - dashGap);
    // Dash stroke is thicker than the track so round ends bulge out visibly
    const dashWidth = coreWidth * 1.4;

    return (
        <g style={{ pointerEvents: "none" }}>
            <defs>
                <style>{`
                    @keyframes ${animId} {
                        from { stroke-dashoffset: ${DASH_PERIOD}; }
                        to   { stroke-dashoffset: 0; }
                    }
                `}</style>
            </defs>

            {/* Hover glow */}
            {highlighted && (
                <path d={path} fill="none" stroke={outerColor} strokeWidth={width + 8} opacity={0.28} strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Static shell – solid thin background track */}
            <path d={path} fill="none" stroke={outerColor} strokeWidth={width * 0.5} opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />

            {/* Animated flowing dashes – direction of travel is always source → dest */}
            <path
                d={path}
                fill="none"
                stroke={innerColor}
                strokeWidth={dashWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${dashLen} ${dashGap}`}
                style={{
                    animation: `${animId} ${duration}s linear infinite`,
                }}
            />

            {/* Terminal dot at branch end (arrival at IN hub) */}
            {showEndDot && (
                <circle cx={end.x} cy={end.y} r={dotRadius} fill={tintColor ?? outerColor} />
            )}
        </g>
    );
}
