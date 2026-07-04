/**
 * Tiny deterministic noise helpers for the demo simulator.
 *
 * The simulator must be a *pure function of time* so that any timestamp can be
 * replayed — scrubbing the history timeline re-evaluates past moments and must
 * yield identical values. We therefore avoid `Math.random()` and derive every
 * "random" quantity from a stable string key plus the simulation clock.
 */

/** FNV-1a hash → unsigned 32-bit seed. */
export function hashString(input: string): number {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/** Stable pseudo-random value in [0,1) for a given key (mulberry32). */
export function rand01(key: string): number {
    let t = (hashString(key) + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Stable phase offset in [0, 2π) for a key. */
function phase(key: string): number {
    return rand01(`phase:${key}`) * Math.PI * 2;
}

/**
 * Smooth, deterministic noise in [0,1] that varies slowly with the clock.
 * Two sine octaves of different periods give an organic, non-repeating feel
 * without any hidden state.
 */
export function smoothNoise(key: string, tMs: number, periodMs: number): number {
    const a = Math.sin((tMs / periodMs) * Math.PI * 2 + phase(`${key}|a`));
    const b = Math.sin((tMs / (periodMs * 0.37)) * Math.PI * 2 + phase(`${key}|b`));
    return (a * 0.7 + b * 0.3 + 1) / 2;
}

/** Clamp helper. */
export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}
