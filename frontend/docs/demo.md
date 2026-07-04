# Demo mode (standalone, backend-free)

The demo is a self-contained build of the frontend that needs **no backend**. The
user supplies (or picks) raw Kubernetes manifests, the browser parses them, infers
a service-communication topology, and continuously **synthesises backend-shaped
graph snapshots** under a chosen load profile. Everything renders through the exact
same [topology canvas](components.md) and [timeline scrubber](components.md) as the
live product, so the demo is a faithful preview of what KubeVisor would show for a
user's own cluster.

It exists so the project can be hosted as an open-source showcase: visitors paste
their `kubectl` YAML, dial up the load, and watch their cluster light up.

## Enabling it

`src/main.tsx` renders `DemoApp` instead of `App` when either is true:

- `import.meta.env.VITE_DEMO_MODE === "true"` — set by [`.env.demo`](../.env.demo)
  and used by the `demo` Vite mode, or
- the page URL carries a `?demo` query param (handy on a normal build).

```bash
npm run dev:demo                 # vite dev server in demo mode
npm run build:demo               # tsc -b && vite build --mode demo
npm run build:demo -- --base=/kubevisor/   # e.g. GitHub Pages project subpath
```

A normal `npm run dev` / `npm run build` is unaffected and still renders the live
app against a backend.

## Hosting on GitHub Pages

The demo is fully static, so it is published to GitHub Pages by
[`.github/workflows/deploy-demo.yml`](../../.github/workflows/deploy-demo.yml) on
every push to `main` that touches `frontend/`. The workflow builds with
`--mode demo` and sets `--base=/<repo>/` (project sites are served from a
sub-path), then deploys with the official Pages actions.

One-time setup: in the repository, **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The site is then served at
`https://<owner>.github.io/<repo>/` (for this repo,
`https://al1ve1t.github.io/kubevisor/`).

## How it works

```
YAML manifests ──parse──▶ ParsedCluster ──build──▶ ClusterTopology
                                                        │
                            LoadConfig ────────────────▶│  (per tick)
                                                        ▼
                                                  GraphSnapshot  ──▶ TopologyCanvas
```

The data flow is intentionally identical to the live app's snapshot contract
([data-model.md](data-model.md)) — only the **source** of snapshots differs.

### 1. Parse (`demo/kubeParser.ts`)

`parseClusterYaml(text)` uses `js-yaml` `loadAll` to read a multi-document bundle
and extracts:

- **Workloads** — `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Pod`,
  `Job`, `CronJob`, `Rollout` → name, replicas, container images, probes, and the
  flattened environment (inline `env` plus `envFrom` ConfigMap data).
- **ConfigMaps / Services / Ingress** — used to resolve env and detect exposure.

**Node type** is inferred from image/name keywords (`postgres` → `DATABASE`,
`redis` → `CACHE`, `kafka` → `QUEUE`, `nginx`/`gateway` → `GATEWAY`, else
`SERVICE`).

**Dependency edges are inferred from the environment**, the way a human reading the
manifests would: a value like `SERVICES_AUTH_URL: http://auth-service:8081` or
`DB_HOST: postgres` is tokenised and matched against known Service / workload
names, producing `order-service → auth-service`, `order-service → postgres`, etc.
If no references are found, a representative topology is synthesised so the cluster
still renders connected (a warning is surfaced in the sidebar).

**Entry points** are workloads behind a `LoadBalancer`/`NodePort` Service or an
`Ingress` (falling back to gateways, then dependency roots).

### 2. Build topology (`demo/topology.ts`)

`buildTopology(cluster)` produces the metric-free skeleton: one `TopologyNode` per
workload plus a synthetic `INPUT` node (`ingress`) wired to every entry point, and
one `TopologyEdge` per dependency. This is the structure the simulator decorates
each tick.

### 3. Simulate load (`demo/loadSimulator.ts`)

`createSimulator(topology)` returns `snapshotAt(tMs, config)` — a **pure function of
time**, so any timestamp can be replayed (this is what makes the history scrubber
work). Randomness is derived from stable string keys via `demo/prng.ts`, never
`Math.random()`.

Load model:

- **Injected nodes** are driven directly. In **manual** mode every service is
  user-controlled; in the **load-test scenario** only entry-point services receive
  external demand and the rest of the cluster lights up purely from the resulting
  cascade.
- A 3-pass relaxation propagates caller throughput onto callees (`edge.rps =
  source.throughput × weight`), so databases and caches heat up as a function of
  who calls them — making shared backends a realistic bottleneck.
- Per-node **utilisation** drives pod CPU/RAM, pod phases (overload → `NOT_READY`
  /`CRASH_LOOP`, high memory → `OOMKilled`), and per-edge `loadLevel`, latency, and
  error rate — mapped to the same thresholds as the live [visual
  language](visual-language.md).

**Load-test scenario.** The default mode plays a repeating storyline (≈6 min/cycle)
so the demo reads like a real load test rather than random noise: traffic **ramps
up**, **holds at peak** (busy but healthy), then a scripted **incident** saturates a
deterministic victim — a database if present, else the most depended-on node — into
an outage (CRITICAL load, crashing pods) while its direct callers degrade waiting on
it, before **recovery**. The failure is therefore *locatable*: a red sub-graph
centred on one node, at a findable point in the timeline (which also reports
"N/M pods not ready"). Metrics evolve on long, smooth curves and the snapshot
refreshes roughly every 2.5 s, so values look aggregated — they never strobe or jump
within a second.

`LoadConfig` is `{ mode: "scenario" | "manual"; intensity; manualLevels }` where each
service's `DemandLevel` is one of `IDLE | NORMAL | ELEVATED | HIGH | CRITICAL`. The
**intensity** slider scales the whole test (push it up to force a bigger outage).

### 4. Drive + render (`demo/useDemoSimulation.ts`, `demo/DemoApp.tsx`)

`useDemoSimulation` advances a virtual clock while "playing", appends each snapshot
to a rolling history buffer for the scrubber, and recomputes the live snapshot when
the clock or load config changes. `DemoApp` wires the sidebar
(`DemoControlPanel`), the YAML editor (`ClusterYamlEditor`), the shared
`TopologyCanvas`, and the shared `TimelineScrubber`.

Because the demo has a single ingress lane, `main.tsx` calls
`setInputLayoutMode("center")` (from [helpers/nodeGeometry.ts](../src/helpers/nodeGeometry.ts))
when demo mode is active, so the `INPUT` bar is centred vertically. The live app
keeps its default two-lane (`internal` top / `ingress` bottom) split.

## Files

| File | Responsibility |
| --- | --- |
| [demo/clusterModel.ts](../src/demo/clusterModel.ts) | Demo domain types (`ParsedCluster`, `ClusterTopology`, …) |
| [demo/kubeParser.ts](../src/demo/kubeParser.ts) | `kubectl` YAML → `ParsedCluster` (env-based dependency inference) |
| [demo/topology.ts](../src/demo/topology.ts) | `ParsedCluster` → metric-free `ClusterTopology` |
| [demo/loadSimulator.ts](../src/demo/loadSimulator.ts) | Topology + `LoadConfig` → backend-shaped `GraphSnapshot` |
| [demo/prng.ts](../src/demo/prng.ts) | Deterministic time-based noise helpers |
| [demo/useDemoSimulation.ts](../src/demo/useDemoSimulation.ts) | Virtual clock, history buffer, live snapshot |
| [demo/sampleClusters.ts](../src/demo/sampleClusters.ts) | Bundled sample manifests |
| [demo/DemoApp.tsx](../src/demo/DemoApp.tsx) | Demo page shell |
| [demo/DemoControlPanel.tsx](../src/demo/DemoControlPanel.tsx) | Cluster / layout / load controls |
| [demo/ClusterYamlEditor.tsx](../src/demo/ClusterYamlEditor.tsx) | Paste / upload / sample YAML modal |

> The demo is isolated under `src/demo/`. It **consumes** the shared models,
> components, strategies, and helpers but adds no fields to the snapshot contract —
> it produces exactly the [data model](data-model.md) the live backend would.
