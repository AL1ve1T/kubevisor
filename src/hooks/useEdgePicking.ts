import { useCallback, useMemo } from "react";
import type { EdgeDto } from "../models";
import type { CorridorRenderItem, EdgeRenderItem } from "../helpers/edgeHelpers";

interface Point {
    x: number;
    y: number;
}

export interface EdgePickResult {
    edgeIds: string[];
    /** Null when the hit is on a shared corridor or multi-edge stub */
    edge: EdgeDto | null;
    /** True when the hit is on the corridor trunk itself */
    isCorridor?: boolean;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (dx === 0 && dy === 0) {
        return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    const projX = start.x + clampedT * dx;
    const projY = start.y + clampedT * dy;

    return Math.hypot(point.x - projX, point.y - projY);
}

export function useEdgePicking(edgeItems: EdgeRenderItem[], corridorItems: CorridorRenderItem[] = []) {
    const candidates = useMemo(
        () =>
            edgeItems.map((item) => {
                const pts = [item.start, ...(item.waypoints ?? []), item.end];
                return {
                    ...item,
                    __pts: pts,
                    minX: Math.min(...pts.map((p) => p.x)),
                    maxX: Math.max(...pts.map((p) => p.x)),
                    minY: Math.min(...pts.map((p) => p.y)),
                    maxY: Math.max(...pts.map((p) => p.y)),
                };
            }),
        [edgeItems],
    );

    const corridorCandidates = useMemo(
        () =>
            corridorItems.map((c) => ({
                ...c,
                /** Treat corridor as a vertical segment for distance testing */
                start: { x: c.x, y: c.minY },
                end: { x: c.x, y: c.maxY },
            })),
        [corridorItems],
    );

    const pickAt = useCallback(
        (point: Point): EdgePickResult | null => {
            // ── Try corridor trunks first (they are large targets) ──────────────
            let bestCorridor: { dist: number; item: typeof corridorCandidates[0] } | null = null;
            for (const c of corridorCandidates) {
                const tolerance = c.width / 2 + 4;
                if (
                    point.x < c.x - tolerance || point.x > c.x + tolerance ||
                    point.y < c.minY - tolerance || point.y > c.maxY + tolerance
                ) continue;
                const dist = distanceToSegment(point, c.start, c.end);
                if (dist > tolerance) continue;
                if (!bestCorridor || dist < bestCorridor.dist) bestCorridor = { dist, item: c };
            }

            // ── Try individual edge stubs / branches ─────────────────────────────
            let bestEdge: { score: number; item: EdgeRenderItem } | null = null;
            for (const item of candidates) {
                const tolerance = Math.max(7, item.width / 2 + 4);
                if (
                    point.x < item.minX - tolerance || point.x > item.maxX + tolerance ||
                    point.y < item.minY - tolerance || point.y > item.maxY + tolerance
                ) continue;
                // Check all polyline segments (handles straight lines and bezier waypoints)
                let distance = Infinity;
                const pts = item.__pts;
                for (let i = 0; i < pts.length - 1; i++) {
                    distance = Math.min(distance, distanceToSegment(point, pts[i], pts[i + 1]));
                }
                if (distance > tolerance) continue;

                let score = distance;
                if (item.edgeIds.length > 1) score += 0.75;
                if (item.edge === null) score += 0.15;
                if (item.showEndDot) score -= 0.2;

                if (!bestEdge || score < bestEdge.score) bestEdge = { score, item };
            }

            // Prefer an edge stub if it's closer than the corridor
            if (bestEdge && bestCorridor) {
                const edgeDist = distanceToSegment(point, bestEdge.item.start, bestEdge.item.end);
                if (edgeDist <= bestCorridor.dist - 2) {
                    return { edgeIds: bestEdge.item.edgeIds, edge: bestEdge.item.edge };
                }
            }

            if (bestCorridor) {
                return { edgeIds: bestCorridor.item.edgeIds, edge: null, isCorridor: true };
            }

            if (bestEdge) {
                return { edgeIds: bestEdge.item.edgeIds, edge: bestEdge.item.edge };
            }

            return null;
        },
        [candidates, corridorCandidates],
    );

    return { pickAt };
}
