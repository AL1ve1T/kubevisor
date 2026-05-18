import type { NodeDto, PodPhase } from "../models";
import { NodeType } from "../models";
import { BAR_WIDTH, BORDER_RADIUS, HUB_WIDTH, NODE_HEIGHT, NODE_WIDTH } from "../helpers/nodeGeometry";

const NON_FUNCTIONAL_PHASES: PodPhase[] = ["NOT_READY", "CRASH_LOOP", "FAILED"];

function isNonFunctional(node: NodeDto): boolean {
    return NON_FUNCTIONAL_PHASES.includes(node.podPhase);
}

/** Small red X badge rendered at a hub connection point */
function FaultBadge({ cx, cy }: { cx: number; cy: number }) {
    return (
        <g style={{ pointerEvents: "none" }}>
            <circle cx={cx} cy={cy} r={7} fill="#ef4444" />
            <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={700}
                fontFamily="Inter, system-ui, sans-serif"
                fill="white"
            >
                ✕
            </text>
        </g>
    );
}

interface Position {
    x: number;
    y: number;
}

interface NodeSize {
    width: number;
    height: number;
}

interface GraphNodeProps {
    node: NodeDto;
    position: Position;
    size?: NodeSize;
    highlighted?: boolean;
    selected?: boolean;
    /** Node has at least one outgoing edge (right side OUT hub) */
    hasRightOut?: boolean;
    /** Node receives same-column or backward edges (right side IN hub) */
    hasRightIn?: boolean;
    /** Node receives forward edges arriving at the left side */
    hasLeftIn?: boolean;
    canvasHeight?: number;
    onMouseEnter: (nodeId: string) => void;
    onMouseLeave: () => void;
    onClick?: (nodeId: string, e: React.MouseEvent) => void;
}

export function GraphNode({ node, position, size, highlighted, selected, hasRightOut, hasRightIn, hasLeftIn, canvasHeight, onMouseEnter, onMouseLeave, onClick }: GraphNodeProps) {
    const isBar = node.type === NodeType.INPUT;
    const nodeWidth = size?.width ?? NODE_WIDTH;
    const nodeHeight = size?.height ?? NODE_HEIGHT;
    const fault = isNonFunctional(node);

    // Hub port geometry – capsule shapes straddling the right edge of the node
    const portW = HUB_WIDTH;
    const portH = 28;
    const portX = nodeWidth / 2 - 4;   // 4px inset inside node right border
    const portGap = 5;
    const totalPortH = (hasRightOut && hasRightIn) ? portH * 2 + portGap : portH;
    const portBaseY = -totalPortH / 2;
    const portInY = (hasRightOut && hasRightIn) ? portBaseY + portH + portGap : portBaseY;

    // Center of each right hub capsule (for icon placement)
    const hubCX = portX + portW / 2;
    const outHubCY = portBaseY + portH / 2;
    const inHubCY = portInY + portH / 2;

    // Left incoming hub geometry – mirrors right side, single capsule centred on node
    const leftPortX = -(nodeWidth / 2) - portW + 4; // tip (connection point) at leftPortX
    const leftHubCX = leftPortX + portW / 2;

    if (isBar) {
        const totalH = canvasHeight ?? 600;
        // Nodes whose name contains "internal" occupy the top half (light blue).
        // All other INPUT nodes occupy the bottom half (light orange).
        const isInternalHalf = node.name.toLowerCase().includes("internal");
        const barY = isInternalHalf ? 0 : totalH / 2;
        const barH = totalH / 2;
        const fill = isInternalHalf ? "#dbeafe" : "#fed7aa";
        const stroke = isInternalHalf ? "#93c5fd" : "#fb923c";

        return (
            <g
                transform={`translate(${position.x}, 0)`}
                onMouseEnter={() => onMouseEnter(node.id)}
                onMouseLeave={onMouseLeave}
                onClick={(e) => { e.stopPropagation(); onClick?.(node.id, e); }}
                style={{ cursor: onClick ? "pointer" : "default" }}
            >
                {highlighted && (
                    <rect
                        x={-BAR_WIDTH / 2 - 3}
                        y={barY - 3}
                        width={BAR_WIDTH + 6}
                        height={barH + 6}
                        rx={8}
                        ry={8}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        opacity={0.45}
                    />
                )}
                <rect
                    x={-BAR_WIDTH / 2}
                    y={barY}
                    width={BAR_WIDTH}
                    height={barH}
                    rx={6}
                    ry={6}
                    fill={fill}
                    stroke={highlighted ? "#3b82f6" : stroke}
                    strokeWidth={highlighted ? 2 : 1}
                />
                <text
                    x={0}
                    y={barY + barH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontFamily="Inter, system-ui, sans-serif"
                    fontWeight={600}
                    fill="#6b7280"
                    style={{ textTransform: "uppercase", letterSpacing: 2, pointerEvents: "none" }}
                    transform={`rotate(-90, 0, ${barY + barH / 2})`}
                >
                    {node.name}
                </text>
            </g>
        );
    }

    return (
        <g
            transform={`translate(${position.x}, ${position.y})`}
            onMouseEnter={() => onMouseEnter(node.id)}
            onMouseLeave={onMouseLeave}
            onClick={(e) => { e.stopPropagation(); onClick?.(node.id, e); }}
            style={{ cursor: onClick ? "pointer" : "default" }}
        >
            {/* Selected ring – shown when this node is the focus */}
            {selected && (
                <rect
                    x={-nodeWidth / 2 - 6}
                    y={-nodeHeight / 2 - 6}
                    width={nodeWidth + 12}
                    height={nodeHeight + 12}
                    rx={BORDER_RADIUS + 4}
                    ry={BORDER_RADIUS + 4}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    opacity={0.8}
                />
            )}
            {highlighted && (
                <rect
                    x={-nodeWidth / 2 - 3}
                    y={-nodeHeight / 2 - 3}
                    width={nodeWidth + 6}
                    height={nodeHeight + 6}
                    rx={BORDER_RADIUS + 2}
                    ry={BORDER_RADIUS + 2}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    opacity={0.45}
                />
            )}
            <rect
                x={-nodeWidth / 2}
                y={-nodeHeight / 2}
                width={nodeWidth}
                height={nodeHeight}
                rx={BORDER_RADIUS}
                ry={BORDER_RADIUS}
                fill="#ffffff"
                stroke={fault ? "#ef4444" : highlighted ? "#3b82f6" : "#d1d5db"}
                strokeWidth={fault ? 2.5 : highlighted ? 2 : 1.5}
            />
            {/* Fault pulse ring – extra red glow when pod is non-functional */}
            {fault && (
                <rect
                    x={-nodeWidth / 2 - 4}
                    y={-nodeHeight / 2 - 4}
                    width={nodeWidth + 8}
                    height={nodeHeight + 8}
                    rx={BORDER_RADIUS + 3}
                    ry={BORDER_RADIUS + 3}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    opacity={0.3}
                />
            )}
            {/* OUT hub – amber capsule on the right edge, outgoing forward edges */}
            {hasRightOut && (
                <g>
                    <rect
                        x={portX}
                        y={portBaseY}
                        width={portW}
                        height={portH}
                        rx={portW / 2}
                        ry={portW / 2}
                        fill="#f59e0b"
                        stroke="#d97706"
                        strokeWidth={1}
                    />
                    <path
                        d={`M ${hubCX - 4} ${outHubCY - 5} L ${hubCX + 5} ${outHubCY} L ${hubCX - 4} ${outHubCY + 5} Z`}
                        fill="white"
                        opacity={0.9}
                        style={{ pointerEvents: "none" }}
                    />
                    {fault && <FaultBadge cx={portX + portW} cy={outHubCY} />}
                </g>
            )}
            {/* IN hub – indigo capsule on the right edge, backward / same-column incoming edges */}
            {hasRightIn && (
                <g>
                    <rect
                        x={portX}
                        y={portInY}
                        width={portW}
                        height={portH}
                        rx={portW / 2}
                        ry={portW / 2}
                        fill="#6366f1"
                        stroke="#4f46e5"
                        strokeWidth={1}
                    />
                    <path
                        d={`M ${hubCX + 4} ${inHubCY - 5} L ${hubCX - 5} ${inHubCY} L ${hubCX + 4} ${inHubCY + 5} Z`}
                        fill="white"
                        opacity={0.9}
                        style={{ pointerEvents: "none" }}
                    />
                    {fault && <FaultBadge cx={portX + portW} cy={inHubCY} />}
                </g>
            )}
            {/* LEFT IN – blue capsule on the left edge, forward incoming edges */}
            {hasLeftIn && (
                <g>
                    <rect
                        x={leftPortX}
                        y={-portH / 2}
                        width={portW}
                        height={portH}
                        rx={portW / 2}
                        ry={portW / 2}
                        fill="#3b82f6"
                        stroke="#2563eb"
                        strokeWidth={1}
                    />
                    <path
                        d={`M ${leftHubCX - 4} ${-5} L ${leftHubCX + 5} ${0} L ${leftHubCX - 4} ${5} Z`}
                        fill="white"
                        opacity={0.9}
                        style={{ pointerEvents: "none" }}
                    />
                    {fault && <FaultBadge cx={leftPortX} cy={0} />}
                </g>
            )}
            <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontFamily="Inter, system-ui, sans-serif"
                fontWeight={500}
                fill="#1f2937"
            >
                {node.name}
            </text>
        </g>
    );
}

export { NODE_WIDTH, NODE_HEIGHT, BORDER_RADIUS, BAR_WIDTH };
