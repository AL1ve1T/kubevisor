# Domain model

All internal models live in `com.kubevisor.model`. The four core models are
`Node`, `Edge`, `InteractionEvent`, and `GraphSnapshot`. The frontend only ever
sees the `GraphSnapshot` DTO tree.

## Node

A `Node` represents a service, database, cache, queue, gateway, or external/input
dependency. It is mutable in-memory state held in `GraphStateManager`.

Key fields:

- `id` / `name` — the Kubernetes workload (owner) name; the stable identifier.
- `type` — a `NodeType` (see below). Types are **upgraded toward more specific**
  values: a node first seen via a network flow may be `SERVICE`, then upgraded to
  `DATABASE`/`CACHE`/`QUEUE` when a trace reveals its true nature.
- `namespace` — Kubernetes namespace; back-filled when first learned.
- `cpuUtilization` / `memoryUtilization` — workload roll-up in `[0.0, 1.0]`
  (max across pods), each with a freshness timestamp.
- Pod health roll-up: `podPhase`, `restartCount`, `podCount`, `lastRestartAt`,
  `lastRestartReason` — recomputed from the worst-case across pods.
- `pods` — a map of `PodInstance` replicas (see below).
- `lastSeenAt` — last time any signal touched the node (drives stale cleanup).

### NodeType

```
SERVICE, DATABASE, CACHE, QUEUE, GATEWAY, INPUT
```

`INPUT` is used for synthetic source nodes (`external`, `internal`) and for
unresolved span-name targets. Type inference heuristics live in
`NetworkFlowProcessor.inferNodeType` (by workload name) and `TopologyResolver`
(by span attributes such as `db.system`).

### PodInstance / PodPhase

`PodInstance` carries per-replica `cpuUtilization`, `memoryUtilization`,
`podPhase`, `restartCount`, restart metadata, and freshness timestamps.
Pods are ephemeral — a replica is dropped either by
`GraphStateManager.reconcileNamespacePods` (immediately, when an authoritative
pod-list scrape no longer reports it — i.e. it was deleted/terminated) or by
`GraphStateManager.pruneStalePods` (a fallback for when a replica simply stops
reporting past the stale cutoff). In both cases the workload roll-up is
recomputed.

`PodPhase` models operational health (e.g. `RUNNING`, `CrashLoopBackOff`,
`UNKNOWN`) and defines an `isWorseThan` ordering used to pick the worst-case
phase for the workload roll-up. `UNKNOWN` means no pod data has been received yet.

## Edge

An `Edge` is a **directed** link `source->target` carrying per-second traffic
metrics. Its `id` is `"<sourceId>-><targetId>"`.

- **Instantaneous metrics** describe a single one-second interval — not a
  rolling average. Requests are bucketed by their **span event time**
  (`InteractionEvent.timestamp`), not by arrival time, so a batch of spans that
  arrives together (the demo SDK flushes roughly every 5 s) is spread back across
  the real seconds in which the requests happened rather than spiking into one
  arrival second. The edge keeps two adjacent per-second accumulators (the latest
  second seen and the one before it) and always reports the **most recently
  completed** second — the "previous" bucket, which is only finalized once a
  strictly newer second arrives — so the value is a stable whole-second count
  rather than a partial, still-filling one:
  - `requestsPerSecond` — number of requests observed during that second.
  - `averageLatencyMs` — sum of latencies / requests in that second.
  - `maxLatencyMs` — max request latency in that second.
  - `errorRate` — errors / requests in that second, in `[0.0, 1.0]`.
  Because export batches arrive with gaps, the last reported value is **held**
  until newer traffic replaces it; it only decays to zero once no traffic has
  been recorded for `traffic-hold-seconds` (default 10 s, configurable). This
  bridges the gap between batches so the load reading does not flicker on and off
  between flushes. The hold also means edge load lingers for up to that many
  seconds after traffic actually stops, on top of the telemetry export lag
  (the demo SDK batches spans before sending) — lower `traffic-hold-seconds` to
  make load fade out sooner after a load test ends.
- **Lifetime counter**: `errorCount` accumulates for the edge's whole lifetime
  (display only).
- `protocol` — e.g. `HTTP`, `postgresql`, `redis`, `mysql`, `mongodb`, `kafka`,
  `amqp`, `cassandra`, `elasticsearch`, `TCP`.
- `lastSeenAt` vs `lastTrafficAt` — `lastSeenAt` is refreshed by any touch
  (including Beyla topology-only touches); `lastTrafficAt` is set only when a real
  request span is recorded. Stale cleanup anchors on `lastTrafficAt` when present
  so a traffic-less edge cannot be kept alive forever by network-flow touches.

`Edge` is thread-safe: the per-second accumulators are guarded by a lock and
`errorCount` is an `AtomicLong`.

## InteractionEvent

The normalized representation of one observed communication, produced by
`SpanNormalizer`. It is an immutable `record`:

```java
record InteractionEvent(
    String traceId, String spanId,
    String sourceService, String sourceNamespace,
    String targetService, String targetNamespace,
    NodeType targetType, String protocol,
    double latencyMs, boolean isError, Instant timestamp) {}
```

## GraphSnapshot (frontend DTO)

The frontend-facing, **namespace-scoped** snapshot. One is produced per namespace
by `GraphStateManager.buildSnapshots()`. It is fully documented with OpenAPI
`@Schema` annotations.

```
GraphSnapshot
├─ namespace
├─ nodes: NodeDto[]
│   ├─ id, name, type
│   ├─ podPhase, restartCount, podCount, lastRestartAt, lastRestartReason
│   ├─ lastSeenAt
│   └─ pods: PodDto[]  (podName, cpuUtilization, memoryUtilization,
│                       podPhase, restartCount, restart metadata, lastSeenAt)
├─ edges: EdgeDto[]
│   ├─ id, sourceNodeId, targetNodeId, protocol
│   ├─ requestsPerSecond, averageLatencyMs, maxLatencyMs
│   ├─ errorCount, errorRate
│   ├─ loadLevel  (target node resource pressure → edge colour)
│   └─ lastSeenAt
└─ generatedAt
```

Numeric metric fields are rounded to two decimals at snapshot-build time.
Resource metrics that are stale (older than `resource-metric-stale-seconds`)
are reported as `0.0`.

### LoadLevel

`loadLevel` reflects the **target node's** resource pressure, derived from CPU and
memory utilization against configurable thresholds:

```
NORMAL → green, ELEVATED → yellow, HIGH → orange, CRITICAL → red
```

Thresholds are configured via `kubevisor.cpu-*-threshold` and
`kubevisor.mem-*-threshold` (see [configuration.md](configuration.md)).

### Timeline / history DTOs

Used by the history and timeline endpoints (see [api.md](api.md)):
`RestartEventDto`, `ResourceMetricsPointDto`, `RequestRatePointDto`,
`NamespaceRequestTimelinePointDto`. These are reconstructed from persisted
snapshot history rather than stored as first-class events.
