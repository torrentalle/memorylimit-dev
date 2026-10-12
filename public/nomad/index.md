# HashiCorp Nomad Memory Calculator

Canonical: [HashiCorp Nomad Memory Calculator](https://memorylimit.dev/nomad/)

Locale: en

Purpose: Right-size HashiCorp Nomad task memory reservations and memory_max limits from real usage data, for clusters using memory oversubscription.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/containers.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Nomad places tasks according to their `memory` reservation. With memory oversubscription enabled, `memory_max` lets a task grow past that reservation, up to a hard limit, whenever its client has memory to spare — the same idea as Kubernetes requests and limits. This calculator sizes both from real usage.

## Usage data

Paste box: Raw query output / samples.

**Which query should I paste?**

With telemetry's `publish_allocation_metrics` and `prometheus_metrics` on, use a **range** query over a representative period (a week is a good default) for one task:

```
nomad_client_allocs_memory_usage{job="web", task="api"}
```

Paste the Prometheus UI table output, the HTTP API JSON, or a Grafana CSV export.

Enter observed usage directly, in MiB (Nomad's "MB").

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **Group count**
- **OOMKill sensitivity**: Low — tolerate occasional OOMKills; Medium; High — avoid OOMKills at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Request margin** (%)
- **Limit margin** (%)

## memory, memory_max and oversubscription in short

`memory` is the memory the task requires, in MB. Without `memory_max` it is also the hard limit; with it set, `memory` becomes the reservation and `memory_max` the hard limit. Nomad's own advice is the typical usage for `memory` and `memory_max` to absorb unexpected load spikes. [Nomad docs](https://developer.hashicorp.com/nomad/docs/job-specification/resources)

So the calculator sizes `memory` from the **average** and `memory_max` from the **peak**, with margins that are MemoryLimit's own defaults, not vendor figures; you can change them under *Advanced*.

`memory_max` only works when memory oversubscription is enabled in the scheduler configuration. It is off by default and enabled once per cluster. Without it, `memory` is the hard limit, so a task sized from the average would be killed at that value; the note under the result says to set `memory` to the `memory_max` value in that case. [Nomad docs](https://developer.hashicorp.com/nomad/commands/operator/scheduler/set-config)

**Common input mistakes**

- Filtering by job only: filter by both job and task, or another job's task of the same name is mixed in.
- Pasting from a cluster whose telemetry has `publish_allocation_metrics` off: Nomad publishes allocation metrics only when it is on.
- A window that misses the busiest times: `memory_max` comes out too low.

Full derivation, warnings and every assumption: [how the Nomad calculator works](https://memorylimit.dev/nomad/how-it-works/index.md). The shared formula and margin tables: [the sizing model](https://memorylimit.dev/sizing-model/index.md).

Related calculators:

- [Kubernetes](https://memorylimit.dev/kubernetes/index.md)
- [Docker Compose](https://memorylimit.dev/docker-compose/index.md)

## What you get

- Nomad job (task resources)
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/nomad/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=HashiCorp%20Nomad&title=%5BBug%5D%20HashiCorp%20Nomad%3A%20).
