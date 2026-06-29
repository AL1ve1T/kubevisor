import { buildEdgeRenderItems } from "../helpers/edgeHelpers";
import type { TopologyStrategy } from "./topologyStrategy";

/**
 * Hub-Corridor strategy — the default topology layout.
 *
 * Each edge is broken into:
 *   • A stub leaving the source node's OUT hub capsule (right side)
 *   • A shared vertical corridor trunk between columns
 *   • A branch arriving at either the target node's left side (forward edges)
 *     or the target node's IN hub capsule (same-column / backward edges)
 *
 * Corridors are rendered as a separate visual layer behind the stubs/branches.
 * Edge color is derived from the backend-computed `loadLevel` field.
 */
export const hubCorridorStrategy: TopologyStrategy = {
    id: "hub-corridor",
    label: "Hub Corridor",
    description: "Shares vertical corridor trunks between columns. Directional IN / OUT hub capsules on each node's right side.",
    build: buildEdgeRenderItems,
};
