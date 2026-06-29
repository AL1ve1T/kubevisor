// Centralized metric -> color mapping for pod readiness.
//
// `unhealthyRatio` turns not-ready/total pod counts into a [0..1] fraction, and
// `readinessColor` maps that fraction onto a green -> amber -> red gradient.

const HEALTHY = "#4ade80";
const WARNING = "#f59e0b";
const CRITICAL = "#ef4444";

export function unhealthyRatio(notReadyPods: number, totalPods: number): number {
    if (totalPods <= 0) return 0;
    return Math.min(1, Math.max(0, notReadyPods / totalPods));
}

export function readinessColor(ratio: number): string {
    const r = Math.min(1, Math.max(0, ratio));
    if (r <= 0) return HEALTHY;
    if (r >= 1) return CRITICAL;
    return r < 0.5
        ? lerpHex(HEALTHY, WARNING, r / 0.5)
        : lerpHex(WARNING, CRITICAL, (r - 0.5) / 0.5);
}

function lerpHex(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255;
    const ag = (pa >> 8) & 255;
    const ab = pa & 255;
    const br = (pb >> 16) & 255;
    const bg = (pb >> 8) & 255;
    const bb = pb & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}
