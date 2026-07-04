import { loadAll } from "js-yaml";
import { NodeType } from "../models";
import type {
    InferredEdge,
    ParsedCluster,
    ParsedService,
    ParsedWorkload,
} from "./clusterModel";

/**
 * Parse a bundle of raw Kubernetes manifests (the exact YAML a user gets from
 * `kubectl get -o yaml` or their `deploy/` folder) into a {@link ParsedCluster}.
 *
 * Dependency edges are *inferred* the same way a human reading the manifests
 * would: by scanning each workload's environment (inline `env` plus `envFrom`
 * ConfigMap data) for references to other Service / workload names — e.g.
 * `SERVICES_AUTH_URL: http://auth-service:8081` ⇒ this workload calls
 * `auth-service`. This mirrors how real apps wire service discovery.
 */
const WORKLOAD_KINDS = new Set([
    "Deployment",
    "StatefulSet",
    "DaemonSet",
    "ReplicaSet",
    "Pod",
    "Job",
    "CronJob",
    "Rollout",
]);

const TYPE_RULES: { type: NodeType; pattern: RegExp }[] = [
    {
        type: NodeType.DATABASE,
        pattern: /postgres|postgis|mysql|mariadb|mongo|cockroach|cassandra|oracle|mssql|sqlserver|db2|timescale|influx|clickhouse|elasticsearch|opensearch|(^|[-_])db([-_]|$)|database/,
    },
    { type: NodeType.CACHE, pattern: /redis|valkey|memcached|hazelcast|(^|[-_])cache([-_]|$)/ },
    {
        type: NodeType.QUEUE,
        pattern: /kafka|rabbitmq|rabbit|nats|pulsar|activemq|zookeeper|(^|[-_])mq([-_]|$)|queue|sqs|kinesis|amqp/,
    },
    {
        type: NodeType.GATEWAY,
        pattern: /nginx|envoy|traefik|haproxy|\bkong\b|apisix|gateway|ingress|api-?gw/,
    },
];

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return null;
}

function asStringMap(value: unknown): Record<string, string> {
    const record = asRecord(value);
    if (!record) return {};
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(record)) {
        const str = asString(raw);
        if (str !== null) out[key] = str;
    }
    return out;
}

function inferType(name: string, images: string[]): NodeType {
    const haystack = `${name} ${images.join(" ")}`.toLowerCase();
    for (const rule of TYPE_RULES) {
        if (rule.pattern.test(haystack)) return rule.type;
    }
    return NodeType.SERVICE;
}

interface RawWorkload {
    name: string;
    kind: string;
    replicas: number;
    labels: Record<string, string>;
    images: string[];
    env: { name: string; value: string }[];
    envFromConfigMaps: string[];
    hasProbe: boolean;
}

/** Resolve the pod template spec for any workload kind. */
function podSpecFor(kind: string, spec: Record<string, unknown>): Record<string, unknown> | null {
    if (kind === "Pod") return spec;
    if (kind === "CronJob") {
        const jobTemplate = asRecord(spec.jobTemplate);
        const jobSpec = asRecord(jobTemplate?.spec);
        const template = asRecord(jobSpec?.template);
        return asRecord(template?.spec);
    }
    const template = asRecord(spec.template);
    return asRecord(template?.spec);
}

function labelsFor(
    kind: string,
    metadata: Record<string, unknown>,
    spec: Record<string, unknown>,
): Record<string, string> {
    if (kind === "Pod") return asStringMap(metadata.labels);
    const template = asRecord(spec.template);
    const templateMeta = asRecord(template?.metadata);
    const fromTemplate = asStringMap(templateMeta?.labels);
    if (Object.keys(fromTemplate).length > 0) return fromTemplate;
    const selector = asRecord(spec.selector);
    return asStringMap(selector?.matchLabels);
}

function extractWorkload(kind: string, name: string, doc: Record<string, unknown>): RawWorkload {
    const spec = asRecord(doc.spec) ?? {};
    const metadata = asRecord(doc.metadata) ?? {};
    const podSpec = podSpecFor(kind, spec);

    const replicasRaw = asString(spec.replicas);
    const replicas =
        kind === "Pod" || kind === "Job" || kind === "CronJob" || kind === "DaemonSet"
            ? 1
            : Math.max(1, Math.round(Number(replicasRaw ?? "1")) || 1);

    const images: string[] = [];
    const env: { name: string; value: string }[] = [];
    const envFromConfigMaps: string[] = [];
    let hasProbe = false;

    const containers = [
        ...asArray(podSpec?.containers),
        ...asArray(podSpec?.initContainers),
    ];
    for (const raw of containers) {
        const container = asRecord(raw);
        if (!container) continue;
        const image = asString(container.image);
        if (image) images.push(image);
        if (asRecord(container.readinessProbe) || asRecord(container.livenessProbe)) {
            hasProbe = true;
        }
        for (const rawEnv of asArray(container.env)) {
            const entry = asRecord(rawEnv);
            const envName = asString(entry?.name);
            const envValue = asString(entry?.value);
            if (envName && envValue !== null) env.push({ name: envName, value: envValue });
        }
        for (const rawFrom of asArray(container.envFrom)) {
            const from = asRecord(rawFrom);
            const cmRef = asRecord(from?.configMapRef);
            const cmName = asString(cmRef?.name);
            if (cmName) envFromConfigMaps.push(cmName);
        }
    }

    return {
        name,
        kind,
        replicas,
        labels: labelsFor(kind, metadata, spec),
        images,
        env,
        envFromConfigMaps,
        hasProbe,
    };
}

function collectIngressServices(doc: Record<string, unknown>, sink: Set<string>): void {
    const spec = asRecord(doc.spec);
    if (!spec) return;
    // networking.k8s.io/v1 default backend
    const defaultBackend = asRecord(spec.defaultBackend);
    const defaultService = asRecord(defaultBackend?.service);
    const defaultName = asString(defaultService?.name);
    if (defaultName) sink.add(defaultName);
    // legacy extensions/v1beta1 backend
    const legacyBackend = asRecord(spec.backend);
    const legacyName = asString(legacyBackend?.serviceName);
    if (legacyName) sink.add(legacyName);

    for (const rawRule of asArray(spec.rules)) {
        const rule = asRecord(rawRule);
        const http = asRecord(rule?.http);
        for (const rawPath of asArray(http?.paths)) {
            const path = asRecord(rawPath);
            const backend = asRecord(path?.backend);
            const service = asRecord(backend?.service);
            const name = asString(service?.name) ?? asString(backend?.serviceName);
            if (name) sink.add(name);
        }
    }
}

function tokenize(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .filter((token) => token.length > 1);
}

function protocolFor(targetType: NodeType, value: string): string {
    const lower = value.toLowerCase();
    if (lower.includes("grpc")) return "gRPC";
    if (lower.includes("amqp")) return "AMQP";
    if (targetType === NodeType.DATABASE) return "SQL";
    if (targetType === NodeType.CACHE) return "TCP";
    if (targetType === NodeType.QUEUE) return "TCP";
    return "HTTP";
}

export function parseClusterYaml(text: string): ParsedCluster {
    const warnings: string[] = [];
    let docs: unknown[] = [];
    try {
        docs = (loadAll(text) as unknown[]) ?? [];
    } catch (error) {
        return {
            namespace: "default",
            workloads: [],
            edges: [],
            entryPoints: [],
            warnings: [`YAML parse error: ${(error as Error).message}`],
        };
    }

    const configMaps = new Map<string, Record<string, string>>();
    const rawWorkloads: RawWorkload[] = [];
    const services: ParsedService[] = [];
    const ingressServiceNames = new Set<string>();
    let namespace: string | null = null;

    for (const rawDoc of docs) {
        const doc = asRecord(rawDoc);
        if (!doc) continue;
        const kind = asString(doc.kind);
        if (!kind) continue;
        const metadata = asRecord(doc.metadata) ?? {};
        const name = asString(metadata.name);
        const ns = asString(metadata.namespace);
        if (ns && !namespace) namespace = ns;

        if (kind === "ConfigMap") {
            if (name) configMaps.set(name, asStringMap(doc.data));
            continue;
        }
        if (kind === "Service") {
            const spec = asRecord(doc.spec) ?? {};
            if (name) {
                services.push({
                    name,
                    selector: asStringMap(spec.selector),
                    type: asString(spec.type) ?? "ClusterIP",
                });
            }
            continue;
        }
        if (kind === "Ingress") {
            collectIngressServices(doc, ingressServiceNames);
            continue;
        }
        if (WORKLOAD_KINDS.has(kind) && name) {
            rawWorkloads.push(extractWorkload(kind, name, doc));
        }
    }

    const workloads: ParsedWorkload[] = rawWorkloads.map((raw) => {
        const envValues: string[] = raw.env.map((entry) => entry.value);
        for (const cmName of raw.envFromConfigMaps) {
            const cm = configMaps.get(cmName);
            if (cm) envValues.push(...Object.values(cm));
        }
        return {
            name: raw.name,
            kind: raw.kind,
            replicas: raw.replicas,
            type: inferType(raw.name, raw.images),
            hasProbe: raw.hasProbe,
            labels: raw.labels,
            images: raw.images,
            envValues,
        };
    });

    if (workloads.length === 0) {
        warnings.push(
            "No workloads (Deployment / StatefulSet / DaemonSet / Pod) found in the manifests.",
        );
        return { namespace: namespace ?? "default", workloads, edges: [], entryPoints: [], warnings };
    }

    const workloadByName = new Map(workloads.map((w) => [w.name, w]));

    // Map a Service name → the workload names it selects (or a same-named workload).
    const serviceTargets = (service: ParsedService): string[] => {
        const selectorEntries = Object.entries(service.selector);
        const matches = selectorEntries.length
            ? workloads
                .filter((w) => selectorEntries.every(([k, v]) => w.labels[k] === v))
                .map((w) => w.name)
            : [];
        if (matches.length > 0) return matches;
        return workloadByName.has(service.name) ? [service.name] : [];
    };

    // Token → resolvable workload names (workload names + service names).
    const nameIndex = new Map<string, string[]>();
    for (const w of workloads) nameIndex.set(w.name.toLowerCase(), [w.name]);
    for (const service of services) {
        const targets = serviceTargets(service);
        if (targets.length > 0) nameIndex.set(service.name.toLowerCase(), targets);
    }

    // Infer dependency edges from each workload's resolved environment.
    const edgeMap = new Map<string, InferredEdge>();
    for (const w of workloads) {
        const found = new Map<string, string>(); // targetName → matched value
        for (const value of w.envValues) {
            for (const token of tokenize(value)) {
                const targets = nameIndex.get(token);
                if (!targets) continue;
                for (const target of targets) {
                    if (target !== w.name && !found.has(target)) found.set(target, value);
                }
            }
        }
        for (const [target, value] of found) {
            const targetType = workloadByName.get(target)?.type ?? NodeType.SERVICE;
            const key = `${w.name}->${target}`;
            if (!edgeMap.has(key)) {
                edgeMap.set(key, {
                    source: w.name,
                    target,
                    protocol: protocolFor(targetType, value),
                });
            }
        }
    }
    let edges = [...edgeMap.values()];

    // Determine entry points: workloads behind a LoadBalancer/NodePort Service or
    // referenced by an Ingress.
    const isInfra = (name: string): boolean => {
        const type = workloadByName.get(name)?.type;
        return type === NodeType.DATABASE || type === NodeType.CACHE || type === NodeType.QUEUE;
    };

    const entrySet = new Set<string>();
    for (const service of services) {
        const exposed = service.type === "LoadBalancer" || service.type === "NodePort";
        if (exposed) for (const target of serviceTargets(service)) entrySet.add(target);
    }
    for (const ingressName of ingressServiceNames) {
        const service = services.find((s) => s.name === ingressName);
        const targets = service ? serviceTargets(service) : workloadByName.has(ingressName) ? [ingressName] : [];
        for (const target of targets) entrySet.add(target);
    }

    let entryPoints = [...entrySet].filter((name) => !isInfra(name));

    if (entryPoints.length === 0) {
        const gateways = workloads.filter((w) => w.type === NodeType.GATEWAY).map((w) => w.name);
        if (gateways.length > 0) {
            entryPoints = gateways;
        } else {
            const hasInbound = new Set(edges.map((e) => e.target));
            const roots = workloads
                .filter((w) => !isInfra(w.name) && !hasInbound.has(w.name))
                .map((w) => w.name);
            entryPoints = roots.length > 0 ? roots : workloads.filter((w) => !isInfra(w.name)).slice(0, 1).map((w) => w.name);
        }
        if (entryPoints.length > 0) {
            warnings.push("No external Service/Ingress found — treated source services as entry points.");
        }
    }

    // If env inference found nothing, synthesise a plausible topology so the
    // cluster still renders as a connected graph rather than isolated nodes.
    if (edges.length === 0 && workloads.length > 1) {
        const appServices = workloads
            .filter((w) => w.type === NodeType.SERVICE || w.type === NodeType.GATEWAY)
            .map((w) => w.name);
        const infra = workloads.filter((w) => isInfra(w.name)).map((w) => w.name);
        const synthesized = new Map<string, InferredEdge>();
        for (const entry of entryPoints) {
            for (const target of appServices) {
                if (target === entry) continue;
                synthesized.set(`${entry}->${target}`, { source: entry, target, protocol: "HTTP" });
            }
        }
        for (const service of appServices) {
            for (const target of infra) {
                const targetType = workloadByName.get(target)?.type ?? NodeType.DATABASE;
                synthesized.set(`${service}->${target}`, {
                    source: service,
                    target,
                    protocol: protocolFor(targetType, ""),
                });
            }
        }
        edges = [...synthesized.values()];
        if (edges.length > 0) {
            warnings.push(
                "No service-to-service references found in env — generated a representative topology.",
            );
        }
    }

    return {
        namespace: namespace ?? "default",
        workloads,
        edges,
        entryPoints,
        warnings,
    };
}
