import type { EdgeDto, NodeDto } from "../models";
import { NodeType } from "../models";

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 56;
export const BORDER_RADIUS = 12;
export const BAR_WIDTH = 40;
export const HUB_WIDTH = 20;
export const PORT_GAP = 6;
export const PORT_PADDING = 12;
export const CANVAS_BAR_HEIGHT = 600;

export interface Position {
    x: number;
    y: number;
}

export interface NodeGeometry {
    width: number;
    height: number;
}

export interface EdgePort {
    x: number;
    y: number;
    side: "left" | "right";
}

export function getStreamWidth(rps: number): number {
    const clamped = Math.max(0, Math.min(rps, 40));
    return 5 + (clamped / 40) * 5;
}

export function getNodeCenterY(node: NodeDto | undefined, position: Position): number {
    if (node?.type !== NodeType.INPUT) return position.y;
    const isInternal = node.name.toLowerCase().includes("internal");
    return isInternal ? CANVAS_BAR_HEIGHT / 4 : (3 * CANVAS_BAR_HEIGHT) / 4;
}

function getRequiredPortHeight(widths: number[]): number {
    if (widths.length === 0) return NODE_HEIGHT;
    const contentHeight = widths.reduce((sum, width) => sum + width, 0) + PORT_GAP * Math.max(0, widths.length - 1);
    return Math.max(NODE_HEIGHT, contentHeight + PORT_PADDING * 2);
}

export function buildNodeGeometries(
    nodes: NodeDto[],
    edges: EdgeDto[],
    nodeCols: Record<string, number>,
): Record<string, NodeGeometry> {
    const geometries: Record<string, NodeGeometry> = {};

    for (const node of nodes) {
        if (node.type === NodeType.INPUT) {
            geometries[node.id] = { width: BAR_WIDTH, height: CANVAS_BAR_HEIGHT };
            continue;
        }

        const leftWidths: number[] = [];
        const rightWidths: number[] = [];

        for (const edge of edges) {
            if (edge.targetNodeId !== node.id) continue;
            const sourceCol = nodeCols[edge.sourceNodeId] ?? 0;
            const targetCol = nodeCols[edge.targetNodeId] ?? 0;
            const width = getStreamWidth(edge.requestsPerSecond);
            if (sourceCol < targetCol) leftWidths.push(width);
            else rightWidths.push(width);
        }

        geometries[node.id] = {
            width: NODE_WIDTH,
            height: Math.max(getRequiredPortHeight(leftWidths), getRequiredPortHeight(rightWidths)),
        };
    }

    return geometries;
}

function sortIncomingEdges(
    edgeIds: string[],
    edgesById: Map<string, EdgeDto>,
    positions: Record<string, Position>,
): string[] {
    return [...edgeIds].sort((a, b) => {
        const edgeA = edgesById.get(a);
        const edgeB = edgesById.get(b);
        if (!edgeA || !edgeB) return 0;

        const posA = positions[edgeA.sourceNodeId];
        const posB = positions[edgeB.sourceNodeId];
        const ay = posA?.y ?? 0;
        const by = posB?.y ?? 0;
        if (ay !== by) return ay - by;
        return edgeA.sourceNodeId.localeCompare(edgeB.sourceNodeId);
    });
}

function assignSidePorts(
    edgeIds: string[],
    nodeId: string,
    side: "left" | "right",
    positions: Record<string, Position>,
    geometries: Record<string, NodeGeometry>,
    edgesById: Map<string, EdgeDto>,
    ports: Record<string, EdgePort>,
): void {
    if (edgeIds.length === 0) return;

    const ordered = sortIncomingEdges(edgeIds, edgesById, positions);
    const geometry = geometries[nodeId] ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    const nodePos = positions[nodeId];
    if (!nodePos) return;

    const widths = ordered.map((edgeId) => getStreamWidth(edgesById.get(edgeId)?.requestsPerSecond ?? 0));
    const contentHeight = widths.reduce((sum, width) => sum + width, 0) + PORT_GAP * Math.max(0, widths.length - 1);
    let cursor = nodePos.y - contentHeight / 2;

    ordered.forEach((edgeId, idx) => {
        const width = widths[idx];
        const y = cursor + width / 2;
        ports[edgeId] = {
            side,
            x: nodePos.x + (side === "left" ? -geometry.width / 2 : geometry.width / 2),
            y,
        };
        cursor += width + PORT_GAP;
    });
}

export function buildEdgeTargetPorts(
    nodes: NodeDto[],
    edges: EdgeDto[],
    positions: Record<string, Position>,
    nodeCols: Record<string, number>,
    geometries: Record<string, NodeGeometry>,
): Record<string, EdgePort> {
    const ports: Record<string, EdgePort> = {};
    const edgesById = new Map(edges.map((edge) => [edge.id, edge]));

    for (const node of nodes) {
        if (node.type === NodeType.INPUT) continue;

        const leftIncoming: string[] = [];
        const rightIncoming: string[] = [];

        for (const edge of edges) {
            if (edge.targetNodeId !== node.id) continue;
            const sourceCol = nodeCols[edge.sourceNodeId] ?? 0;
            const targetCol = nodeCols[edge.targetNodeId] ?? 0;
            if (sourceCol < targetCol) leftIncoming.push(edge.id);
            else rightIncoming.push(edge.id);
        }

        assignSidePorts(leftIncoming, node.id, "left", positions, geometries, edgesById, ports);
        assignSidePorts(rightIncoming, node.id, "right", positions, geometries, edgesById, ports);
    }

    return ports;
}
