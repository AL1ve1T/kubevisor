import type { EdgeDto, NodeDto } from "../models";
import type { BuildEdgeResult } from "../helpers/edgeHelpers";
import type { NodeGeometry, Position } from "../helpers/nodeGeometry";

/**
 * A topology strategy encapsulates all logic for converting a graph snapshot
 * into renderable edge segments and corridor trunks.
 *
 * To add a new strategy:
 *   1. Create a file in src/strategies/ that exports a TopologyStrategy object.
 *   2. Register it in src/strategies/index.ts.
 */
export interface TopologyStrategy {
    /** Unique stable identifier used for persistence / URL params. */
    id: string;
    /** Human-readable name shown in the control panel. */
    label: string;
    /** Optional short description shown as a tooltip in the control panel. */
    description?: string;
    /**
     * When true, the canvas omits IN/OUT hub capsule indicators on nodes.
     * Use this for strategies that don't rely on the right-side hub visual.
     */
    hideHubCapsules?: boolean;
    /**
     * Optional override for node positions within each column.
     * Called after the default linear layout, before edges are built.
     * Return a new positions map (can spread and mutate a copy of the input).
     */
    adjustPositions?(
        positions: Record<string, Position>,
        nodes: NodeDto[],
        nodeCols: Record<string, number>,
        nodeGeometries: Record<string, NodeGeometry>,
    ): Record<string, Position>;
    /** Produce the render-ready edge items and corridor trunks for the given snapshot layout. */
    build(
        nodes: NodeDto[],
        edges: EdgeDto[],
        positions: Record<string, Position>,
        nodeMap: Map<string, NodeDto>,
        nodeCols: Record<string, number>,
        colSpacing: number,
        nodeGeometries: Record<string, NodeGeometry>,
    ): BuildEdgeResult;
}
