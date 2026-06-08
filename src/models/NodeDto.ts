export enum NodeType {
    SERVICE = "SERVICE",
    DATABASE = "DATABASE",
    CACHE = "CACHE",
    QUEUE = "QUEUE",
    GATEWAY = "GATEWAY",
    INPUT = "INPUT",
}

export type PodPhase = "RUNNING" | "PENDING" | "NOT_READY" | "CRASH_LOOP" | "FAILED" | "UNKNOWN";

export interface NodeDto {
    id: string;
    name: string;
    type: NodeType;
    cpuUtilization: number;
    memoryUtilization: number;
    podPhase: PodPhase;
    restartCount: number;
    lastRestartAt: string | null;
    lastRestartReason: string | null;
    lastSeenAt: string;
}
