# How the Cloud Run calculator works

Canonical: [How the Cloud Run calculator works](https://memorylimit.dev/cloud-run/how-it-works/)

Locale: en

Purpose: How the Cloud Run calculator sets an instance's memory limit and CPU: Google's concurrency formula, the CPU each size needs and what to paste, with docs links.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Google Cloud Run memory limit calculator](https://memorylimit.dev/cloud-run/index.md)


This page walks through how the [Cloud Run calculator](https://memorylimit.dev/cloud-run/index.md) turns your usage data into an instance's memory limit and the CPU it needs. It starts from the peak side of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by Google's documentation end with a Cloud Run docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## What the memory limit does

- Each instance gets one memory limit, 512 MiB by default, up to 32 GiB. An instance that exceeds it is terminated. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)
- The container's filesystem is in memory: files it writes use the instance's memory, and can use it all up. [Cloud Run docs](https://docs.cloud.google.com/run/docs/container-contract)

With no separate reservation and running out ending the instance, the calculator sizes the limit from the peak alone. The average you enter doesn't change the result.

## From peak usage to a memory limit

```
memory = peak × (1 + limit margin)    rounded up to a whole Mi, kept within 128Mi–32Gi
```

The limit margin comes from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains it, and it's an assumption too.

`--memory` takes `Mi` and `Gi` (or decimal `M` and `G`); the calculator writes `Mi`, or `Gi` for whole gibibytes. The first generation execution environment goes down to 128 MiB, the second needs 512 MiB. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)

### Worked example

Peak 630 MiB, generic workload, medium sensitivity, production:

| memory | 630 MiB × 1.30 = 819 MiB | 819Mi |
| --- | --- | --- |
| CPU | up to 4 GiB, the default is enough | 1 vCPU |

Above 4 GiB, the memory also sets the CPU. Peak 5000 MiB, same profile:

| memory | 5000 MiB × 1.30 = 6500 MiB | 6500Mi |
| --- | --- | --- |
| CPU | between 4 and 8 GiB | 2 vCPU |

## Google's formula: concurrency

Google's own way to size an instance's memory counts requests, not samples: [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)

```
memory = standing memory + memory per request × concurrency
```

The calculator applies it with three optional fields: the instance's *idle memory* (the standing memory), the *maximum concurrency now*, and the *maximum concurrency planned*. Cloud Run defaults to 80 concurrent requests per instance from the console (80 per vCPU from the CLI) and allows up to 1,000. [Cloud Run docs](https://docs.cloud.google.com/run/docs/about-concurrency)

```
memory per request = (peak − idle memory) ÷ concurrency now
planned peak       = idle memory + memory per request × concurrency planned
memory             = planned peak × (1 + limit margin)
```

With the same concurrency, the planned peak is the measured peak, so nothing changes. The measured peak is taken to have happened at the current maximum concurrency; if it happened with fewer requests in flight, memory per request comes out low. [Assumption](#all-assumptions-in-one-place) Without the idle memory, the whole peak counts as per-request memory, and a warning says the result is an upper bound when concurrency goes up, a lower one when it goes down.

Peak 630 MiB at a concurrency of 80, with 120 MiB idle, planning for 160:

| memory per request | (630 − 120) ÷ 80 | 6.375 MiB |
| --- | --- | --- |
| planned peak | 120 + 6.375 × 160 | 1140 MiB |
| memory | 1140 MiB × 1.30 = 1482 MiB | 1482Mi |
| CPU | up to 4 GiB, the default is enough | 1 vCPU |

## The CPU it needs

| Memory | Fewest vCPU allowed |
| --- | --- |
| Up to 512 MiB | 0.08 |
| Up to 1 GiB | 0.5 |
| Up to 4 GiB | 1 |
| Up to 8 GiB | 2 |
| Up to 16 GiB | 4 |
| Up to 24 GiB | 6 |
| Up to 32 GiB | 8 |

Instances get 1 vCPU by default. Less than 1 vCPU is possible, but only with a concurrency of 1, request-based billing and the first generation environment. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/cpu)

So up to 4 GiB the calculator leaves CPU at the default and doesn't suggest a fraction; above it, it adds the fewest vCPU the memory needs. [Assumption](#all-assumptions-in-one-place)

## What the calculator writes

```
gcloud run services update <service> --memory 6500Mi --cpu 2

spec.template.spec.containers[0].resources.limits:
  memory: 6500Mi
  cpu: 2
```

`gcloud run services update SERVICE --memory SIZE` is the documented command, and the service YAML takes the same values under each container's `resources.limits`. [Cloud Run docs](https://docs.cloud.google.com/run/docs/reference/yaml/v1) `--cpu` only appears when the memory needs more than the default.

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Outside Cloud Run's range warning | The result is below 128 MiB or above 32 GiB | Cloud Run's limits. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits) |
| Only first generation warning | The result is below 512 MiB | The second generation needs 512 MiB. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## Where the numbers come from

Cloud Run's built-in metrics include "Container memory utilization". [Cloud Run docs](https://docs.cloud.google.com/run/docs/monitoring) The documentation lists it without its unit; we read it as a share of the instance's current limit, as the console charts it. So multiply its p99 over a representative period by the current limit to get the peak in MiB, and its p50 for the average, which doesn't change the result. [Assumption](#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| The measured peak happened at the current maximum concurrency | About your setup | It's how memory per request is worked out from a single peak | If fewer requests were in flight at the peak, memory per request, and the planned memory, come out low. |
| Keep the default 1 vCPU up to 4 GiB | Our default | Less than 1 vCPU forces concurrency 1 and the first generation | A service that fits those limits could run on 0.5 or 0.08 vCPU for less. |
| Utilization is a share of the limit; p99 × limit is the peak | Our reading | The docs list the metric without a unit; the console charts it against the limit | A rarer spike than p99 isn't covered; use the maximum if you can export it. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the memory limit |

## References

- [Configure memory limits](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits) — range, units, the gcloud command and Google's sizing formula.
- [Configure CPU limits](https://docs.cloud.google.com/run/docs/configuring/services/cpu) — the default and the CPU each memory size needs.
- [Container runtime contract](https://docs.cloud.google.com/run/docs/container-contract) — the in-memory filesystem and what happens past the limit.
- [Service YAML reference](https://docs.cloud.google.com/run/docs/reference/yaml/v1) — `resources.limits.memory` and `cpu`.
- [Monitor health and performance](https://docs.cloud.google.com/run/docs/monitoring) — the built-in metrics.

[← Back to the Cloud Run calculator](https://memorylimit.dev/cloud-run/index.md)
