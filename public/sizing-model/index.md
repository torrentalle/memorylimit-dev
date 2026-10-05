# How the sizing model works

Canonical: [How the sizing model works](https://memorylimit.dev/sizing-model/)

Locale: en

Purpose: How MemoryLimit turns average and peak memory usage into a request and a limit: the formula, the margin tables, a worked example, and the assumptions.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← All calculators](https://memorylimit.dev/index.md)

Ten of the calculators start the same way: from the average and peak memory you observed, they work out two values, a **request** and a **limit**, and only then apply their platform's own rules. This page explains that shared step. The margins it adds are MemoryLimit's own defaults, not figures from any vendor, so each one is explained and marked Assumption, which links to the table of all of them. Statements backed by vendor documentation end with a link to it, such as Kubernetes docs. What each platform does next is on its own calculator page.

## Two values, two jobs

Most platforms take memory as a pair of settings with different jobs. Kubernetes is the clearest case ([Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)):

- **The request** is what the scheduler uses to decide which node a Pod goes on. A container may use more than its request when the node has memory to spare. [Kubernetes docs](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- **The limit** is enforced by the kernel: a container that uses more than its memory limit may be OOM-killed. [Kubernetes docs](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

So the request should cover normal running, and the limit the worst moment. Sizing both from one number either wastes memory (everything sized for the peak) or invites OOM kills (everything sized for the average). That's why the model sizes the request from the **average** and the limit from the **peak**. Other platforms call the pair something else: a reservation and a limit, a minimum and a maximum, `memory` and `memory_max`.

## Average and peak

You can type the two numbers, in MiB, or paste monitoring output and let the calculator read them. A paste is turned into a list of samples: the average is their mean and the peak is the largest. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place) Values in bytes are converted to MiB. Numbers without a unit are read as bytes, unless every one of them is below 1,000,000: no process runs in less than a megabyte, so those are read as MiB. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place) Kubernetes exports a series for the whole Pod and one for its pause container next to each real container; those are skipped, because averaging them in would skew the result.

The samples cover a representative period, busiest times included, and each one is the memory of a single instance (one container, task, function or process), not a total across replicas. The model can't tell either from the numbers. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place)

A peak below the average can't happen with real samples, so the calculator still shows a result but flags it as an error: it usually means two different series were pasted or typed.

## The formula

```
request = average × (1 + request margin)
limit   = peak    × (1 + limit margin)

margin  = (sensitivity base + workload adjustment) × environment multiplier
```

The two margins are worked out the same way, each from its own table. The base comes from the sensitivity you choose, the workload type adds or removes percentage points, and the environment then scales the sum. The values stay unrounded here; each calculator rounds them to the steps and units its platform accepts.

## The margins

No vendor publishes a general safety margin for memory, so every value below is a MemoryLimit default: round figures that give clearly different results for each choice. They aren't measured, they're the same on every platform, and changing one changes every calculator's output. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place)

If you know the headroom your service needs, you don't have to go through the tables: every calculator has an **Advanced: margins and defaults** section, closed by default, where a request margin and a limit margin (0–200%) replace the ones the profile gives. Left empty, each shows the profile's margin greyed out. Where a platform has values of its own that you can change, the same section holds them, and its guide lists them.

### Sensitivity: the base

How much an out-of-memory event would hurt. The calculators label it after what happens on their platform: OOMKill, eviction or memory pressure.

| Sensitivity | Request margin | Limit margin |
| --- | --- | --- |
| Low | 15% | 20% |
| Medium | 30% | 30% |
| High | 50% | 40% |

### Workload type: the adjustment

Percentage points added to the base, before the environment scales it.

| Workload type | Request | Limit | Why |
| --- | --- | --- | --- |
| JVM | +15 | +30 | A JVM's heap can keep growing toward its maximum until garbage collection reclaims it, so samples may not have caught how much it will take. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place) |
| Worker / batch | −10 | +35 | Memory is spiky: small between jobs, large during one. Less is reserved and more room is left above the peak. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place) |
| Cache | +5 | 0 | A cache tends to fill whatever it's given, so its usual level sits close to its peak. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place) |
| API service, Node.js, Python, generic | 0 | 0 | The base margins as they are. |

### Environment: the multiplier

| Environment | Margins kept |
| --- | --- |
| Development | 60% |
| Staging | 85% |
| Production | 100% |

An OOM kill costs less outside production, so less memory is set aside for it there. If a staging environment has to behave exactly like production, choose Production. [Assumption](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place)

## Worked example

A JVM service with medium sensitivity in staging, averaging 410 MiB with a 630 MiB peak:

| request margin | (30% + 15%) × 0.85 | 38.25% |
| --- | --- | --- |
| request | 410 MiB × 1.3825 | 566.825 MiB |
| limit margin | (30% + 30%) × 0.85 | 51% |
| limit | 630 MiB × 1.51 | 951.3 MiB |

On the Kubernetes calculator these become a 567Mi request and a 952Mi limit once rounded up to a whole Mi; another platform would round them its own way.

## How the profile changes the result

The same 410 MiB average and 630 MiB peak under a few profiles, before any rounding:

| Workload, sensitivity, environment | Request margin | Request | Limit margin | Limit |
| --- | --- | --- | --- | --- |
| Generic, medium, production | 30% | 533 MiB | 30% | 819 MiB |
| JVM, medium, production | 45% | 594.5 MiB | 60% | 1,008 MiB |
| Worker / batch, medium, production | 20% | 492 MiB | 65% | 1,039.5 MiB |
| Cache, medium, production | 35% | 553.5 MiB | 30% | 819 MiB |
| Generic, high, production | 50% | 615 MiB | 40% | 882 MiB |
| Generic, medium, staging | 25.5% | 514.55 MiB | 25.5% | 790.65 MiB |
| Worker / batch, low, development | 3% | 422.3 MiB | 33% | 837.9 MiB |

## What each calculator does next

Each calculator maps the two values onto its platform's settings, then rounds them and applies the platform's minimums, maximums and ordering rules. Platforms with a single memory setting use only the peak-based limit, because running out there is a hard failure.

| Calculator | From the request | From the limit |
| --- | --- | --- |
| [Kubernetes](https://memorylimit.dev/kubernetes/index.md) | `requests.memory` | `limits.memory`; with Guaranteed QoS, both get the larger value |
| [Docker Compose](https://memorylimit.dev/docker-compose/index.md) | `reservations.memory` | `limits.memory` |
| [HashiCorp Nomad](https://memorylimit.dev/nomad/index.md) | `memory` | `memory_max` |
| [AWS Lambda](https://memorylimit.dev/lambda/index.md) | Not used | `MemorySize` |
| [Google Cloud Run](https://memorylimit.dev/cloud-run/index.md) | Not used | Memory limit |
| [Azure Functions](https://memorylimit.dev/azure-functions/index.md) | Not used | Instance size |
| [Systemd / Bare Metal / VM](https://memorylimit.dev/systemd/index.md) | Expected usage (shown, not enforced) | `MemoryHigh`, and `MemoryMax` above it |
| [VMware vSphere](https://memorylimit.dev/vmware/index.md) | Reservation | The VM's memory size; no limit, as VMware advises |
| [Proxmox VE](https://memorylimit.dev/proxmox/index.md) | Minimum memory (`balloon`) | Memory |
| [Redis maxmemory](https://memorylimit.dev/redis/index.md) | `maxmemory`: the larger of the two |  |

The [Couchbase calculator](https://memorylimit.dev/couchbase/index.md) doesn't use this model: its quotas come from the dataset, with Couchbase's own sizing formula ([how it works](https://memorylimit.dev/couchbase/how-it-works/index.md)).

## All assumptions in one place

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Sensitivity base margins: 15/30/50% on the request, 20/30/40% on the limit | Our default | No vendor publishes a general memory margin; these are round defaults | Too small and you'll see OOM kills or evictions; too large and memory sits unused. Pick another sensitivity, or set your own margins under Advanced. |
| Workload adjustments for JVM, worker/batch and cache | Our default | How these runtimes typically use memory beyond what samples show | If your service doesn't behave like its type, choose Generic, or set your own margins under Advanced. |
| Development keeps 60% of the margins, staging 85% | Our default | An OOM kill costs less outside production | Choose Production for an environment that must not fail. |
| The samples cover a representative period, busiest times included | About your setup | The average and the peak are only as good as the window | A missed peak gives a limit that's too low. |
| Each sample is one instance's memory | About your setup | Every value is per replica, task or process | A series summed across replicas makes every value too large by the replica count. |
| Average and maximum, not percentiles | Our default | They work with as few as one or two samples | One outlier spike raises the limit; remove it from the paste if it isn't real. |
| Numbers without a unit, all below 1,000,000, are MiB | Our default | A process's memory in bytes is always above a million; in MiB it rarely is | Unitless KiB or kB values would be read as MiB; paste them with their unit, or type the average and peak in MiB. |

## References

- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) (Kubernetes) — what a memory request and a memory limit each do.
- [ADR 0003: average for the request, peak for the limit](https://github.com/torrentalle/memorylimit-dev/blob/main/docs/adr/0003-sizing-model-average-for-request-peak-for-limit.md) — why the model works this way, and the alternatives considered.
- [`calculator.js`](https://github.com/torrentalle/memorylimit-dev/blob/main/public/js/calculator.js) — the code, with the margin tables.

[← All calculators](https://memorylimit.dev/index.md)
