export type { TopologyStrategy } from "./topologyStrategy";
export { hubCorridorStrategy } from "./hubCorridorStrategy";
export { arcColumnStrategy } from "./arcColumnStrategy";

import { hubCorridorStrategy } from "./hubCorridorStrategy";
import { arcColumnStrategy } from "./arcColumnStrategy";
import type { TopologyStrategy } from "./topologyStrategy";

/** All available topology strategies, in display order. */
export const TOPOLOGY_STRATEGIES: TopologyStrategy[] = [
    hubCorridorStrategy,
    arcColumnStrategy,
];

export const DEFAULT_STRATEGY_ID = arcColumnStrategy.id;

export function getStrategy(id: string): TopologyStrategy {
    return TOPOLOGY_STRATEGIES.find((s) => s.id === id) ?? hubCorridorStrategy;
}
