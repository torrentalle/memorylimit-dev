# HashiCorp Nomad Memory Calculator

Canonical: [HashiCorp Nomad Memory Calculator](https://memorylimit.dev/nomad/)

Locale: en

Purpose: Right-size HashiCorp Nomad task memory reservations and memory_max limits from real usage data, for clusters using memory oversubscription.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/containers.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Nomad places tasks according to their `memory` reservation. With memory oversubscription enabled, `memory_max` lets a task grow past that reservation, up to a hard limit, whenever its client has memory to spare — the same idea as Kubernetes requests and limits. This calculator sizes both from real usage.

## Usage data

Paste box: Raw query output or samples.

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

## What you get

- Nomad job (task resources)
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/nomad/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new/choose).
