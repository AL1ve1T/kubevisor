import type { EdgeDto, LoadLevel, NodeDto } from "../models";
import { NodeType } from "../models";
import {
    BAR_WIDTH,
    buildEdgeTargetPorts,
    getNodeCenterY,
    HUB_WIDTH,
    NODE_WIDTH,
    type NodeGeometry,
    type Position,
} from "./nodeGeometry";

export type EdgeTier = "primary" | "secondary" | "background";

/**
 * Classify an edge into a visual importance tier.
 * primary   – high load or elevated error rate → rendered at full prominence
 * secondary – moderate traffic → slightly visible
 * background– near-idle → heavily faded in overview mode
 */
export function getEdgeTier(edge: EdgeDto): EdgeTier {
    if (edge.loadLevel === "CRITICAL" || edge.loadLevel === "HIGH") return "primary";
    if (edge.loadLevel === "ELEVATED") return "secondary";
    return "background";
}

interface NodeAnchor {
    leftX: number;
    rightX: number;
    y: number;
}

interface PreparedEdge {
    edge: EdgeDto;
    source: NodeAnchor;
    target: NodeAnchor;
    sourceCol: number;
    targetCol: number;
}

interface RawRoute {
    points: Position[];
    color: string;
    width: number;
    edge: EdgeDto | null;
    edgeIds: string[];
    showArrow: boolean;
    hubTint?: "out" | "in" | null;
}

interface RouteSegment {
    route: RawRoute;
    start: Position;
    end: Position;
    isTerminal: boolean;
}

interface SegmentAggregate {
    start: Position;
    end: Position;
    width: number;
    color: string;
    priority: number;
    rps: number;
    edgeIds: Set<string>;
    clickableEdgeIds: Set<string>;
    clickableEdge: EdgeDto | null;
    terminalUses: number;
    nonTerminalUses: number;
    hubTint: "out" | "in" | null;
}

export interface EdgeRenderItem {
    id: string;
    path: string;
    start: Position;
    end: Position;
    /**
     * Optional intermediate sample points along the path for non-straight edges
     * (e.g. bezier curves). The picker uses the polyline [start, ...waypoints, end]
     * for distance testing instead of just the chord start→end.
     */
    waypoints?: Position[];
    color: string;
    width: number; rps: number; edge: EdgeDto | null;
    edgeIds: string[];
    showEndDot: boolean;
    /** Segments immediately leaving an OUT hub are tinted amber; arriving at IN hub are tinted indigo */
    hubTint?: "out" | "in" | null;
}

/** A distinct corridor trunk rendered separately from individual edge stubs/branches */
export interface CorridorRenderItem {
    id: string;
    /** x centre of the corridor trunk */
    x: number;
    minY: number;
    maxY: number;
    /** Dominant colour based on highest-load / error edge in the corridor */
    color: string;
    /** Trunk width – grows with total RPS, bounded between 12 and 30 */
    width: number;
    /** All edge IDs that flow through this corridor */
    edgeIds: string[];
}

const MIN_TURN_GAP = 28;
const SAME_LAYER_LANE = 130;
const BACKWARD_LANE = 190;

// Hub capsule geometry – must match GraphNode.tsx
const HUB_PORT_H = 32;
const HUB_PORT_GAP = 6;
/** How many px the hub capsule extends beyond the node's right border */
const HUB_PROTRUDE = HUB_WIDTH - 4; // = 8

/**
 * Absolute connection point at the right tip of the OUT (amber) hub capsule.
 * hasIncoming drives vertical positioning (same logic as GraphNode portBaseY).
 */
function getOutHubAnchor(
    nodePos: Position,
    nodeWidth: number,
    hasIncoming: boolean,
): Position {
    const x = nodePos.x + nodeWidth / 2 + HUB_PROTRUDE;
    const y = hasIncoming
        ? nodePos.y - (HUB_PORT_H / 2 + HUB_PORT_GAP / 2)
        : nodePos.y;
    return toPoint(x, y);
}

/**
 * Absolute connection point at the right tip of the IN (indigo) hub capsule.
 * hasOutgoing drives vertical positioning.
 */
function getInHubAnchor(
    nodePos: Position,
    nodeWidth: number,
    hasOutgoing: boolean,
): Position {
    const x = nodePos.x + nodeWidth / 2 + HUB_PROTRUDE;
    const y = hasOutgoing
        ? nodePos.y + (HUB_PORT_H / 2 + HUB_PORT_GAP / 2)
        : nodePos.y;
    return toPoint(x, y);
}
/** Extra space the corridor trunk extends beyond the first/last connecting stub */
const CORRIDOR_CAP = 10;

/**
 * Combined health color derived from error rate AND CPU/RAM load level.
 * Severity = max(errorSeverity, loadSeverity) so the worst signal wins.
 * Inactive edges (rps=0) are grey.
 */
export function colorFromMetrics(errorRate: number, loadLevel: LoadLevel, rps: number): string {
    if (rps === 0) return "#9ca3af"; // grey – no traffic
    const loadSeverity: Record<LoadLevel, number> = { NORMAL: 0, ELEVATED: 1, HIGH: 2, CRITICAL: 3 };
    const errSev = errorRate >= 0.15 ? 3 : errorRate >= 0.05 ? 2 : errorRate >= 0.005 ? 1 : 0;
    switch (Math.max(loadSeverity[loadLevel], errSev)) {
        case 3: return "#ef4444"; // red – critical
        case 2: return "#f97316"; // orange – high
        case 1: return "#eab308"; // yellow – elevated
        default: return "#22c55e"; // green – healthy
    }
}

/**
 * Edge width relative to the busiest edge in the graph.
 * Inactive (rps=0) → 1.5px.  Active → 2–10px proportional to rps/maxRps.
 */
export function relativeEdgeWidth(rps: number, maxRps: number): number {
    if (rps === 0 || maxRps === 0) return 1.5;
    return 2 + (rps / maxRps) * 8;
}

/** Width of a corridor trunk – grows with cumulative RPS */
function calcCorridorWidth(totalRps: number): number {
    return clamp(12 + totalRps / 10, 14, 32);
}

/** Dominant colour for the corridor — worst combined severity among active edges */
function calcCorridorColor(edges: PreparedEdge[]): string {
    const active = edges.filter((pe) => pe.edge.requestsPerSecond > 0);
    if (active.length === 0) return "#9ca3af";
    const loadSeverity: Record<LoadLevel, number> = { NORMAL: 0, ELEVATED: 1, HIGH: 2, CRITICAL: 3 };
    let worst = 0;
    for (const pe of active) {
        const errSev = pe.edge.errorRate >= 0.15 ? 3 : pe.edge.errorRate >= 0.05 ? 2 : pe.edge.errorRate >= 0.005 ? 1 : 0;
        worst = Math.max(worst, loadSeverity[pe.edge.loadLevel], errSev);
    }
    switch (worst) {
        case 3: return "#ef4444";
        case 2: return "#f97316";
        case 1: return "#eab308";
        default: return "#22c55e";
    }
}

/** Width of an individual stub/branch line, relative to the graph max RPS */
function stubWidth(rps: number, maxRps: number): number {
    return Math.max(1.5, relativeEdgeWidth(rps, maxRps) * 0.65);
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function toPoint(x: number, y: number): Position {
    return { x: round1(x), y: round1(y) };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getNodeHalfWidth(node: NodeDto | undefined): number {
    return node?.type === NodeType.INPUT ? BAR_WIDTH / 2 : NODE_WIDTH / 2;
}

function getNodeAnchor(
    nodeId: string,
    positions: Record<string, Position>,
    nodeMap: Map<string, NodeDto>,
): NodeAnchor | null {
    const position = positions[nodeId];
    if (!position) return null;

    const node = nodeMap.get(nodeId);
    const halfW = getNodeHalfWidth(node);
    const y = getNodeCenterY(node, position);

    return {
        leftX: position.x - halfW,
        rightX: position.x + halfW,
        y,
    };
}

function normalizePoints(points: Position[]): Position[] {
    if (points.length <= 1) return points;
    const normalized: Position[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = normalized[normalized.length - 1];
        const curr = points[i];
        if (prev.x !== curr.x || prev.y !== curr.y) {
            normalized.push(curr);
        }
    }
    return normalized;
}

function buildSegmentPath(start: Position, end: Position): string {
    return `M ${round1(start.x)} ${round1(start.y)} L ${round1(end.x)} ${round1(end.y)}`;
}

function buildSegmentKey(start: Position, end: Position): string {
    return `${start.x},${start.y}>${end.x},${end.y}`;
}

function routePriority(route: RawRoute): number {
    return route.edge ? route.edge.requestsPerSecond : route.width;
}

function collectColumnMetrics(
    preparedEdges: PreparedEdge[],
    positions: Record<string, Position>,
    nodeCols: Record<string, number>,
): {
    columnX: Map<number, number>;
    columnLeftX: Map<number, number>;
    columnRightX: Map<number, number>;
} {
    const columnX = new Map<number, number>();
    const columnLeftX = new Map<number, number>();
    const columnRightX = new Map<number, number>();

    for (const [nodeId, col] of Object.entries(nodeCols)) {
        const position = positions[nodeId];
        if (!position) continue;
        if (!columnX.has(col)) columnX.set(col, position.x);
    }

    for (const edge of preparedEdges) {
        const sourceLeft = columnLeftX.get(edge.sourceCol);
        const sourceRight = columnRightX.get(edge.sourceCol);
        const targetLeft = columnLeftX.get(edge.targetCol);
        const targetRight = columnRightX.get(edge.targetCol);

        columnLeftX.set(edge.sourceCol, sourceLeft === undefined ? edge.source.leftX : Math.min(sourceLeft, edge.source.leftX));
        columnRightX.set(edge.sourceCol, sourceRight === undefined ? edge.source.rightX : Math.max(sourceRight, edge.source.rightX));
        columnLeftX.set(edge.targetCol, targetLeft === undefined ? edge.target.leftX : Math.min(targetLeft, edge.target.leftX));
        columnRightX.set(edge.targetCol, targetRight === undefined ? edge.target.rightX : Math.max(targetRight, edge.target.rightX));
    }

    return { columnX, columnLeftX, columnRightX };
}

function buildAtomicSegments(routes: RawRoute[]): RouteSegment[] {
    const routeSegments: RouteSegment[] = [];
    const horizontalBreakpoints = new Map<string, Set<number>>();
    const verticalBreakpoints = new Map<string, Set<number>>();

    for (const route of routes) {
        const points = normalizePoints(route.points);
        if (points.length < 2) continue;

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            if (start.x === end.x && start.y === end.y) continue;

            const isHorizontal = start.y === end.y;
            const key = isHorizontal ? `${start.y}` : `${start.x}`;
            const breakpoints = isHorizontal
                ? (horizontalBreakpoints.get(key) ?? new Set<number>())
                : (verticalBreakpoints.get(key) ?? new Set<number>());
            breakpoints.add(isHorizontal ? start.x : start.y);
            breakpoints.add(isHorizontal ? end.x : end.y);

            if (isHorizontal) horizontalBreakpoints.set(key, breakpoints);
            else verticalBreakpoints.set(key, breakpoints);

            routeSegments.push({
                route,
                start,
                end,
                isTerminal: route.showArrow && i === points.length - 2,
            });
        }
    }

    const atomicSegments: RouteSegment[] = [];

    for (const segment of routeSegments) {
        const isHorizontal = segment.start.y === segment.end.y;
        const breakpoints = Array.from(
            (isHorizontal ? horizontalBreakpoints.get(`${segment.start.y}`) : verticalBreakpoints.get(`${segment.start.x}`)) ?? new Set<number>(),
        ).sort((a, b) => a - b);

        const startValue = isHorizontal ? segment.start.x : segment.start.y;
        const endValue = isHorizontal ? segment.end.x : segment.end.y;
        const minValue = Math.min(startValue, endValue);
        const maxValue = Math.max(startValue, endValue);
        const relevant = breakpoints.filter((value) => value >= minValue && value <= maxValue);

        if (relevant.length < 2) {
            atomicSegments.push(segment);
            continue;
        }

        const ordered = endValue >= startValue ? relevant : [...relevant].reverse();
        for (let i = 0; i < ordered.length - 1; i++) {
            const fromValue = ordered[i];
            const toValue = ordered[i + 1];
            if (fromValue === toValue) continue;

            const start = isHorizontal ? toPoint(fromValue, segment.start.y) : toPoint(segment.start.x, fromValue);
            const end = isHorizontal ? toPoint(toValue, segment.start.y) : toPoint(segment.start.x, toValue);
            atomicSegments.push({
                route: segment.route,
                start,
                end,
                isTerminal: segment.isTerminal && i === ordered.length - 2,
            });
        }
    }

    return atomicSegments;
}

function mergeOverlappingRoutes(routes: RawRoute[]): EdgeRenderItem[] {
    const segments = new Map<string, SegmentAggregate>();

    for (const segment of buildAtomicSegments(routes)) {
        const key = buildSegmentKey(segment.start, segment.end);
        let aggregate = segments.get(key);

        if (!aggregate) {
            aggregate = {
                start: segment.start,
                end: segment.end,
                width: segment.route.width,
                color: segment.route.color,
                priority: routePriority(segment.route),
                rps: segment.route.edge?.requestsPerSecond ?? 0,
                edgeIds: new Set<string>(),
                clickableEdgeIds: new Set<string>(),
                clickableEdge: null,
                terminalUses: 0,
                nonTerminalUses: 0,
                hubTint: segment.route.hubTint ?? null,
            };
            segments.set(key, aggregate);
        }

        const priority = routePriority(segment.route);
        if (
            segment.route.width > aggregate.width ||
            (segment.route.width === aggregate.width && priority > aggregate.priority)
        ) {
            aggregate.width = segment.route.width;
            aggregate.color = segment.route.color;
            aggregate.priority = priority;
            aggregate.rps = Math.max(aggregate.rps, segment.route.edge?.requestsPerSecond ?? 0);
        }

        for (const edgeId of segment.route.edgeIds) {
            aggregate.edgeIds.add(edgeId);
        }

        if (segment.route.edge && segment.route.edgeIds.length === 1) {
            aggregate.clickableEdgeIds.add(segment.route.edge.id);
            aggregate.clickableEdge = aggregate.clickableEdgeIds.size === 1 ? segment.route.edge : null;
        }

        if (segment.isTerminal) aggregate.terminalUses += 1;
        else aggregate.nonTerminalUses += 1;
        // Keep a tint only if all contributors agree on the same tint
        if (aggregate.hubTint !== segment.route.hubTint) aggregate.hubTint = null;
    }

    return Array.from(segments.values())
        .map((segment, idx) => ({
            id: `seg-${idx}`,
            path: buildSegmentPath(segment.start, segment.end),
            start: segment.start,
            end: segment.end,
            color: segment.color,
            width: segment.width,
            rps: segment.rps,
            edge: segment.clickableEdgeIds.size === 1 ? segment.clickableEdge : null,
            edgeIds: Array.from(segment.edgeIds),
            showEndDot: segment.terminalUses > 0 && segment.nonTerminalUses === 0,
            hubTint: segment.hubTint,
        }))
        .sort((a, b) => a.width - b.width);
}

export interface BuildEdgeResult {
    edgeItems: EdgeRenderItem[];
    corridorItems: CorridorRenderItem[];
}

export function buildEdgeRenderItems(
    nodes: NodeDto[],
    edges: EdgeDto[],
    positions: Record<string, Position>,
    nodeMap: Map<string, NodeDto>,
    nodeCols: Record<string, number>,
    _colSpacing: number,
    nodeGeometries: Record<string, NodeGeometry>,
): BuildEdgeResult {
    const preparedEdges: PreparedEdge[] = [];
    const targetPorts = buildEdgeTargetPorts(nodes, edges, positions, nodeCols, nodeGeometries);
    // Maximum RPS across all edges – used for proportional width scaling
    const maxRps = edges.reduce((m, e) => Math.max(m, e.requestsPerSecond), 0);

    // Which nodes have outgoing / incoming edges – used for hub anchor Y positioning
    const nodesWithOutgoing = new Set<string>();
    const nodesWithIncoming = new Set<string>();
    for (const e of edges) {
        nodesWithOutgoing.add(e.sourceNodeId);
        nodesWithIncoming.add(e.targetNodeId);
    }

    for (const edge of edges) {
        const source = getNodeAnchor(edge.sourceNodeId, positions, nodeMap);
        const target = getNodeAnchor(edge.targetNodeId, positions, nodeMap);
        if (!source || !target) continue;

        preparedEdges.push({
            edge,
            source,
            target,
            sourceCol: nodeCols[edge.sourceNodeId] ?? 0,
            targetCol: nodeCols[edge.targetNodeId] ?? 0,
        });
    }

    const { columnLeftX, columnRightX } = collectColumnMetrics(preparedEdges, positions, nodeCols);

    // ── Corridor X positions (one per unique column-pair / direction) ───────────
    const forwardCorridorX = new Map<string, number>();
    const sameCorridorX = new Map<number, number>();
    const backwardCorridorX = new Map<string, number>();

    for (const pe of preparedEdges) {
        if (pe.targetCol > pe.sourceCol) {
            const key = `${pe.sourceCol}→${pe.targetCol}`;
            if (!forwardCorridorX.has(key)) {
                const srcRight = columnRightX.get(pe.sourceCol) ?? pe.source.rightX;
                const tgtLeft = columnLeftX.get(pe.targetCol) ?? pe.target.leftX;
                forwardCorridorX.set(key, clamp((srcRight + tgtLeft) / 2, srcRight + MIN_TURN_GAP, tgtLeft - MIN_TURN_GAP));
            }
        } else if (pe.targetCol === pe.sourceCol) {
            if (!sameCorridorX.has(pe.sourceCol)) {
                const colRight = columnRightX.get(pe.sourceCol) ?? pe.source.rightX;
                sameCorridorX.set(pe.sourceCol, colRight + SAME_LAYER_LANE);
            }
        } else {
            const key = `${pe.sourceCol}→${pe.targetCol}`;
            if (!backwardCorridorX.has(key)) {
                const srcRight = columnRightX.get(pe.sourceCol) ?? pe.source.rightX;
                backwardCorridorX.set(key, srcRight + BACKWARD_LANE);
            }
        }
    }

    // ── Per-corridor span accumulator ────────────────────────────────────────────
    interface CorridorAccum {
        x: number;
        minY: number;
        maxY: number;
        edges: PreparedEdge[];
    }
    const corridorAccum = new Map<string, CorridorAccum>();

    function touchCorridor(key: string, x: number, y1: number, y2: number, pe: PreparedEdge) {
        const existing = corridorAccum.get(key);
        if (existing) {
            existing.minY = Math.min(existing.minY, y1, y2);
            existing.maxY = Math.max(existing.maxY, y1, y2);
            existing.edges.push(pe);
        } else {
            corridorAccum.set(key, { x, minY: Math.min(y1, y2), maxY: Math.max(y1, y2), edges: [pe] });
        }
    }

    // ── Build stub + branch raw routes ──────────────────────────────────────────
    const rawRoutes: RawRoute[] = [];

    for (const pe of preparedEdges) {
        const targetPort = targetPorts[pe.edge.id];
        const color = colorFromMetrics(pe.edge.errorRate, pe.edge.loadLevel, pe.edge.requestsPerSecond);
        const sw = stubWidth(pe.edge.requestsPerSecond, maxRps);

        const srcNode = nodeMap.get(pe.edge.sourceNodeId);
        const tgtNode = nodeMap.get(pe.edge.targetNodeId);
        const srcPos = positions[pe.edge.sourceNodeId];
        const tgtPos = positions[pe.edge.targetNodeId];

        // Service nodes exit from the OUT hub right tip; INPUT bars use the plain right edge
        const srcAnchor = (srcNode?.type !== NodeType.INPUT && srcPos)
            ? getOutHubAnchor(srcPos, NODE_WIDTH, nodesWithIncoming.has(pe.edge.sourceNodeId))
            : { x: pe.source.rightX, y: pe.source.y };

        if (pe.targetCol > pe.sourceCol) {
            // Forward edge: target arrives on LEFT side (no right-side hub for left arrival)
            const cKey = `fwd:${pe.sourceCol}→${pe.targetCol}`;
            const corridorX = forwardCorridorX.get(`${pe.sourceCol}→${pe.targetCol}`)!;
            const endX = targetPort?.x ?? pe.target.leftX;
            const endY = targetPort?.y ?? pe.target.y;

            touchCorridor(cKey, corridorX, srcAnchor.y, endY, pe);

            rawRoutes.push({
                points: [toPoint(srcAnchor.x, srcAnchor.y), toPoint(corridorX, srcAnchor.y)],
                color, width: sw, edge: pe.edge, edgeIds: [pe.edge.id], showArrow: false, hubTint: "out",
            });
            rawRoutes.push({
                points: [toPoint(corridorX, endY), toPoint(endX, endY)],
                color, width: sw, edge: pe.edge, edgeIds: [pe.edge.id], showArrow: true, hubTint: null,
            });
        } else if (pe.targetCol === pe.sourceCol) {
            // Same-column edge: target arrives at IN hub right tip
            const cKey = `same:${pe.sourceCol}`;
            const corridorX = sameCorridorX.get(pe.sourceCol)!;
            const tgtAnchor = (tgtNode?.type !== NodeType.INPUT && tgtPos)
                ? getInHubAnchor(tgtPos, NODE_WIDTH, nodesWithOutgoing.has(pe.edge.targetNodeId))
                : { x: pe.target.rightX, y: targetPort?.y ?? pe.target.y };

            touchCorridor(cKey, corridorX, srcAnchor.y, tgtAnchor.y, pe);

            rawRoutes.push({
                points: [toPoint(srcAnchor.x, srcAnchor.y), toPoint(corridorX, srcAnchor.y)],
                color, width: sw, edge: pe.edge, edgeIds: [pe.edge.id], showArrow: false, hubTint: "out",
            });
            rawRoutes.push({
                points: [toPoint(corridorX, tgtAnchor.y), toPoint(tgtAnchor.x, tgtAnchor.y)],
                color, width: sw, edge: pe.edge, edgeIds: [pe.edge.id], showArrow: true, hubTint: "in",
            });
        } else {
            // Backward edge: target arrives at IN hub right tip
            const cKey = `bwd:${pe.sourceCol}→${pe.targetCol}`;
            const corridorX = backwardCorridorX.get(`${pe.sourceCol}→${pe.targetCol}`)!;
            const tgtAnchor = (tgtNode?.type !== NodeType.INPUT && tgtPos)
                ? getInHubAnchor(tgtPos, NODE_WIDTH, nodesWithOutgoing.has(pe.edge.targetNodeId))
                : { x: pe.target.rightX, y: targetPort?.y ?? pe.target.y };

            touchCorridor(cKey, corridorX, srcAnchor.y, tgtAnchor.y, pe);

            rawRoutes.push({
                points: [toPoint(srcAnchor.x, srcAnchor.y), toPoint(corridorX, srcAnchor.y)],
                color, width: sw, edge: pe.edge, edgeIds: [pe.edge.id], showArrow: false, hubTint: "out",
            });
            rawRoutes.push({
                points: [toPoint(corridorX, tgtAnchor.y), toPoint(tgtAnchor.x, tgtAnchor.y)],
                color, width: sw, edge: pe.edge, edgeIds: [pe.edge.id], showArrow: true, hubTint: "in",
            });
        }
    }

    // ── Build CorridorRenderItem list ────────────────────────────────────────────
    const corridorItems: CorridorRenderItem[] = [];
    let cidx = 0;
    for (const [, accum] of corridorAccum) {
        const totalRps = accum.edges.reduce((s, pe) => s + pe.edge.requestsPerSecond, 0);
        corridorItems.push({
            id: `corridor-${cidx++}`,
            x: accum.x,
            minY: accum.minY - CORRIDOR_CAP,
            maxY: accum.maxY + CORRIDOR_CAP,
            color: calcCorridorColor(accum.edges),
            width: calcCorridorWidth(totalRps),
            edgeIds: accum.edges.map((pe) => pe.edge.id),
        });
    }

    return { edgeItems: mergeOverlappingRoutes(rawRoutes), corridorItems };
}
