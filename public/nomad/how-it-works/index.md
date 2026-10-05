# How the Nomad calculator works

Canonical: [How the Nomad calculator works](https://memorylimit.dev/nomad/how-it-works/)

Locale: en

Purpose: How the Nomad calculator sets a task's memory and memory_max: Nomad's own guidance, rounding, minimums, memory oversubscription and what to paste, with links to the Nomad docs and source.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← HashiCorp Nomad memory calculator](https://memorylimit.dev/nomad/index.md)

This page walks through how the [Nomad calculator](https://memorylimit.dev/nomad/index.md) turns your usage data into a task's `memory` and `memory_max`. Both start from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by HashiCorp's documentation or Nomad's source end with a Nomad docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## What the two settings do

- **`memory`** is the memory the task requires, in MB. Without `memory_max` it is also the hard limit. [Nomad docs](https://developer.hashicorp.com/nomad/docs/job-specification/resources)
- **`memory_max`** is the most the task may use when its client has memory to spare. With it set, `memory` becomes the reservation and `memory_max` the hard limit. [Nomad docs](https://developer.hashicorp.com/nomad/docs/job-specification/resources)

Nomad's own advice matches the shared model: set `memory` to the task's typical usage and `memory_max` to absorb unexpected load spikes. [Nomad docs](https://developer.hashicorp.com/nomad/docs/job-specification/resources) So the calculator sizes `memory` from the average and `memory_max` from the peak.

## memory and memory_max

```
memory     = max(average × (1 + request margin), 10)     rounded up to a whole MB
memory_max = max(peak × (1 + limit margin), memory)       rounded up to a whole MB
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too.

- Nomad's MB are mebibytes: it converts them to bytes with 1024 × 1024, so MiB values pass through unchanged. [Nomad source](https://github.com/hashicorp/nomad/blob/main/nomad/structs/structs.go)
- Nomad rejects a task with less than 10 MB of `memory`, or with `memory_max` below `memory`, so the result is raised to whichever applies. [Nomad source](https://github.com/hashicorp/nomad/blob/main/nomad/structs/structs.go)

### Worked example

Average 410 MiB, peak 630 MiB, generic workload, medium sensitivity, production, a group count of 3:

| memory | 410 MiB × 1.30 = 533 MiB | 533 MB |
| --- | --- | --- |
| memory_max | 630 MiB × 1.30 = 819 MiB, above memory | 819 MB |
| total reserved | 533 MB × 3 allocations | 1599 MB |

When the peak is close to the average, `memory` can decide `memory_max`. Average 1000 MiB and peak 1010 MiB, high sensitivity:

| memory | 1000 MiB × 1.50 = 1500 MiB | 1500 MB |
| --- | --- | --- |
| memory_max | 1010 MiB × 1.40 = 1414 MiB, below memory | 1500 MB |

## Memory oversubscription

`memory_max` only works when memory oversubscription is enabled in the scheduler configuration. It's off by default and enabled once per cluster: [Nomad docs](https://developer.hashicorp.com/nomad/commands/operator/scheduler/set-config)

```
nomad operator scheduler set-config -memory-oversubscription=true
```

Without it, `memory` is the hard limit, so a task sized here would be killed at its average-based value. The note under the result says to set `memory` to the `memory_max` value in that case. [Assumption](https://memorylimit.dev/nomad/how-it-works/index.md#all-assumptions-in-one-place)

Nomad also advises keeping an eye on memory use and leaving enough reserved memory on each client, because oversubscribed tasks can run a client out of memory. [Nomad docs](https://developer.hashicorp.com/nomad/docs/job-specification/resources)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
nomad_client_allocs_memory_usage{job="web", task="api"}
```

- Nomad publishes allocation metrics when telemetry has `publish_allocation_metrics` on, and serves them in Prometheus format at `/v1/metrics?format=prometheus` with `prometheus_metrics` on. [Nomad docs](https://developer.hashicorp.com/nomad/docs/configuration/telemetry)
- `nomad.client.allocs.memory.usage` is a gauge of the total memory a task uses, in bytes, labelled with `job`, `task_group`, `task` and `alloc_id`, among others. Filtering by both job and task keeps another job's task of the same name out. [Nomad docs](https://developer.hashicorp.com/nomad/docs/reference/metrics)
- Total usage includes file cache. Nomad also reports `rss` and `cache` separately, but RSS leaves out memory the task does need, so the calculator sizes from total usage and errs on the high side. [Assumption](https://memorylimit.dev/nomad/how-it-works/index.md#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Size from total usage, cache included | Our default | RSS alone leaves out memory the task needs | Tasks that read many files get larger values than they strictly need. |
| Without oversubscription, use the memory_max value for memory | Our default | `memory` is then the hard limit, and it has to cover the peak | Sizing `memory` from the average alone would get the task killed at its first peak. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes `memory` |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes `memory_max` |

## References

- [`resources` block](https://developer.hashicorp.com/nomad/docs/job-specification/resources) — `memory`, `memory_max` and how to choose them.
- [`nomad operator scheduler set-config`](https://developer.hashicorp.com/nomad/commands/operator/scheduler/set-config) — enabling memory oversubscription.
- [Telemetry configuration](https://developer.hashicorp.com/nomad/docs/configuration/telemetry) — `publish_allocation_metrics` and `prometheus_metrics`.
- [Metrics reference](https://developer.hashicorp.com/nomad/docs/reference/metrics) — `nomad.client.allocs.memory.*`.
- [Nomad source: structs.go](https://github.com/hashicorp/nomad/blob/main/nomad/structs/structs.go) — MB to bytes, the 10 MB minimum and `memory_max` ≥ `memory`.

[← Back to the Nomad calculator](https://memorylimit.dev/nomad/index.md)
