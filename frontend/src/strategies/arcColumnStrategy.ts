import type { EdgeDto, NodeDto } from "../models";
import { NodeType } from "../models";
import type { BuildEdgeResult, EdgeRenderItem } from "../helpers/edgeHelpers";
import { colorFromMetrics, relativeEdgeWidth } from "../helpers/edgeHelpers";
import type { Position, NodeGeometry } from "../helpers/nodeGeometry";
import { NODE_WIDTH, BAR_WIDTH, getNodeCenterY } from "../helpers/nodeGeometry";
import type { TopologyStrategy } from "./topologyStrategy";

/** Extra bowl-X offset applied to each direction of a same-column bidirectional pair.
 *  One edge bows BIDIR_BOWL_OFFSET px further right, the other the same amount closer,
 *  so the two otherwise-identical cubic beziers become visually and pickably distinct. */
const BIDIR_BOWL_OFFSET = 20;

function r(v: number): string {
    return String(Math.round(v * 10) / 10);
}

function cubicPath(
    sx: number, sy: number,
    cx1: number, cy1: number,
    cx2: number, cy2: number,
    tx: number, ty: number,
): string {
    return `M ${r(sx)} ${r(sy)} C ${r(cx1)} ${r(cy1)}, ${r(cx2)} ${r(cy2)}, ${r(tx)} ${r(ty)}`;
}

/** Sample a cubic bezier at t values [0.25, 0.5, 0.75] for picker waypoints. */
function bezierWaypoints(
    sx: number, sy: number,
    cx1: number, cy1: number,
    cx2: number, cy2: number,
    tx: number, ty: number,
): { x: number; y: number }[] {
    return [0.25, 0.5, 0.75].map((t) => {
        const mt = 1 - t;
        return {
            x: Math.round((mt * mt * mt * sx + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * tx) * 10) / 10,
            y: Math.round((mt * mt * mt * sy + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * ty) * 10) / 10,
        };
    });
}

function halfWidth(node: NodeDto | undefined): number {
    return node?.type === NodeType.INPUT ? BAR_WIDTH / 2 : NODE_WIDTH / 2;
}

export const arcColumnStrategy: TopologyStrategy = {
    id: "arc-column",
    label: "Arc Column",
    description:
        "Nodes within each column bow into a C-arc (middle pushed left, top/bottom flush right). " +
        "Same-column edges sweep through the arc bowl; cross-column edges flow as S-curves.",
    hideHubCapsules: true,

    adjustPositions(
        positions: Record<string, Position>,
        nodes: NodeDto[],
        nodeCols: Record<string, number>,
        _nodeGeometries: Record<string, NodeGeometry>,
    ): Record<string, Position> {
        // Group non-INPUT service nodes by column, sorted top-to-bottom
        const colGroups = new Map<number, NodeDto[]>();
        for (const node of nodes) {
            if (node.type === NodeType.INPUT) continue;
            const col = nodeCols[node.id] ?? 0;
            const group = colGroups.get(col) ?? [];
            group.push(node);
            colGroups.set(col, group);
        }

        const adjusted = { ...positions };

        for (const [, group] of colGroups) {
            if (group.length < 2) continue;
            group.sort((a, b) => (positions[a.id]?.y ?? 0) - (positions[b.id]?.y ?? 0));

            const ys = group.map((n) => positions[n.id]?.y ?? 0);
            const span = ys[ys.length - 1] - ys[0];
            const arcDepth = Math.min(span * 0.38, 100);
            if (arcDepth < 20) continue;

            group.forEach((node, i) => {
                const t = i / (group.length - 1);
                // sin(π·t): 0 at top, 1 at middle, 0 at bottom → pushes middle leftward
                const xOffset = -arcDepth * Math.sin(Math.PI * t);
                const orig = positions[node.id];
                if (orig) {
                    adjusted[node.id] = { x: Math.round((orig.x + xOffset) * 10) / 10, y: orig.y };
                }
            });
        }

        return adjusted;
    },

    build(
        nodes: NodeDto[],
        edges: EdgeDto[],
        // NOTE: positions here are already arc-adjusted by TopologyCanvas
        positions: Record<string, Position>,
        nodeMap: Map<string, NodeDto>,
        nodeCols: Record<string, number>,
        colSpacing: number,
        _nodeGeometries: Record<string, NodeGeometry>,
    ): BuildEdgeResult {
        const maxRps = edges.reduce((m, e) => Math.max(m, e.requestsPerSecond), 0);

        // For each column find the rightmost node right-edge (after arc shift).
        // Top/bottom nodes stay at original x; middle nodes bow leftward — so the
        // max right-edge belongs to the outermost (top/bottom) nodes.
        // Same-column bezier control points should sit BEYOND this rightward edge,
        // routing through the concave inner bowl of the arc.
        const colMaxRightEdgeX = new Map<number, number>();
        for (const node of nodes) {
            if (node.type === NodeType.INPUT) continue;
            const col = nodeCols[node.id] ?? 0;
            const pos = positions[node.id];
            if (!pos) continue;
            const rx = pos.x + NODE_WIDTH / 2;
            const cur = colMaxRightEdgeX.get(col);
            colMaxRightEdgeX.set(col, cur === undefined ? rx : Math.max(cur, rx));
        }

        const edgeItems: EdgeRenderItem[] = [];

        // Detect same-column bidirectional pairs.  Two edges that connect the same pair
        // of nodes in the same column but in opposite directions produce an identical cubic
        // bezier (just reversed), making both unclickable.  Pre-compute a ±bowl-offset for
        // each such edge so the rendered curves separate visually.
        const biDirBowlOffsetMap = new Map<string, number>(); // edgeId → ±BIDIR_BOWL_OFFSET
        {
            const sameColEdgeKey = new Map<string, string>(); // `${src}|${tgt}` → edgeId
            for (const edge of edges) {
                const srcCol = nodeCols[edge.sourceNodeId] ?? 0;
                const tgtCol = nodeCols[edge.targetNodeId] ?? 0;
                if (srcCol === tgtCol) {
                    sameColEdgeKey.set(`${edge.sourceNodeId}|${edge.targetNodeId}`, edge.id);
                }
            }
            for (const [key, edgeId] of sameColEdgeKey) {
                const [src, tgt] = key.split("|");
                const reverseId = sameColEdgeKey.get(`${tgt}|${src}`);
                if (reverseId !== undefined && !biDirBowlOffsetMap.has(edgeId)) {
                    // Assign consistently so one always bows outward and the other inward.
                    const outerEdgeId = edgeId < reverseId ? edgeId : reverseId;
                    const innerEdgeId = edgeId < reverseId ? reverseId : edgeId;
                    biDirBowlOffsetMap.set(outerEdgeId, +BIDIR_BOWL_OFFSET);
                    biDirBowlOffsetMap.set(innerEdgeId, -BIDIR_BOWL_OFFSET);
                }
            }
        }

        for (const edge of edges) {
            const srcNode = nodeMap.get(edge.sourceNodeId);
            const tgtNode = nodeMap.get(edge.targetNodeId);
            const srcPos = positions[edge.sourceNodeId];
            const tgtPos = positions[edge.targetNodeId];
            if (!srcPos || !tgtPos) continue;

            const color = colorFromMetrics(edge.errorRate, edge.loadLevel, edge.requestsPerSecond);
            const width = Math.max(1.5, relativeEdgeWidth(edge.requestsPerSecond, maxRps));
            const srcHW = halfWidth(srcNode);
            const tgtHW = halfWidth(tgtNode);
            const srcY = getNodeCenterY(srcNode, srcPos);
            const tgtY = getNodeCenterY(tgtNode, tgtPos);
            const srcCol = nodeCols[edge.sourceNodeId] ?? 0;
            const tgtCol = nodeCols[edge.targetNodeId] ?? 0;

            let path: string;
            let startPt: Position;
            let endPt: Position;
            let waypoints: Position[];

            if (tgtCol > srcCol) {
                // ── Forward edge: right of source → left of target, horizontal S-curve ──
                const sx = srcPos.x + srcHW;
                const tx = tgtPos.x - tgtHW;
                const dx = tx - sx;
                const cx1 = sx + dx * 0.45;
                const cx2 = tx - dx * 0.45;
                path = cubicPath(sx, srcY, cx1, srcY, cx2, tgtY, tx, tgtY);
                startPt = { x: sx, y: srcY };
                endPt = { x: tx, y: tgtY };
                waypoints = bezierWaypoints(sx, srcY, cx1, srcY, cx2, tgtY, tx, tgtY);
            } else if (tgtCol === srcCol) {
                // ── Same-column edge: both nodes connect from their RIGHT side ──
                // The arc bows middle nodes leftward, so the concave inner bowl is
                // on the right. Control points sit 60 px beyond the rightmost right-edge.
                // For bidirectional pairs the bowl is additionally offset ± BIDIR_BOWL_OFFSET
                // so the two curves become visually distinct and individually pickable.
                const sx = srcPos.x + srcHW;
                const tx = tgtPos.x + tgtHW;
                const baseBowlX = (colMaxRightEdgeX.get(srcCol) ?? Math.max(sx, tx)) + 60;
                const bowlX = baseBowlX + (biDirBowlOffsetMap.get(edge.id) ?? 0);
                path = cubicPath(sx, srcY, bowlX, srcY, bowlX, tgtY, tx, tgtY);
                startPt = { x: sx, y: srcY };
                endPt = { x: tx, y: tgtY };
                waypoints = bezierWaypoints(sx, srcY, bowlX, srcY, bowlX, tgtY, tx, tgtY);
            } else {
                // ── Backward edge: right of source → right of target, loop right ──
                const sx = srcPos.x + srcHW;
                const tx = tgtPos.x + tgtHW;
                const bowlX = Math.max(sx, tx) + colSpacing * 0.35;
                path = cubicPath(sx, srcY, bowlX, srcY, bowlX, tgtY, tx, tgtY);
                startPt = { x: sx, y: srcY };
                endPt = { x: tx, y: tgtY };
                waypoints = bezierWaypoints(sx, srcY, bowlX, srcY, bowlX, tgtY, tx, tgtY);
            }

            edgeItems.push({
                id: edge.id,
                path,
                start: startPt,
                end: endPt,
                waypoints,
                color,
                width,
                rps: edge.requestsPerSecond,
                edge,
                edgeIds: [edge.id],
                showEndDot: true,
                hubTint: null,
            });
        }

        return { edgeItems, corridorItems: [] };
    },
};
