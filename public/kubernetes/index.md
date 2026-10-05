# Kubernetes Memory Limit Calculator

Canonical: [Kubernetes Memory Limit Calculator](https://memorylimit.dev/kubernetes/)

Locale: en

Purpose: Calculate Kubernetes memory requests and limits from real Prometheus usage data. Avoid OOMKilled pods and over-provisioned clusters. Free, in your browser.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/containers.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Pods that request too little memory get OOMKilled the moment usage spikes; Pods that request too much sit idle and hurt cluster bin-packing. This calculator turns real usage data — pasted straight from a Prometheus or Grafana query, or entered by hand — into a `resources.requests.memory` / `resources.limits.memory` pair sized for your workload type, environment, and OOMKill tolerance.

## Usage data

Paste box: Raw query output / scrape.

**Which query should I paste?**

Use a **range** query over a representative period (a week is a good default) for one container. Every sample is averaged, and the highest becomes the peak — an instant query only gives one value per pod.

```
container_memory_working_set_bytes{namespace="prod", container="api"}
```

The working set is what the kubelet measures to decide when a node is short of memory, so it’s the metric to size from.

Paste the Prometheus UI table output, the HTTP API JSON, or a Grafana CSV export. Pod-level (`container=""`) and pause-container (`container="POD"`) series are skipped automatically.

Enter observed usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **Replica count**
- **OOMKill sensitivity**: Low — tolerate occasional OOMKills; Medium; High — avoid OOMKills at all cost
- **Environment**: Development; Staging; Production
- **QoS class**: Burstable — request below limit; Guaranteed — request equals limit
- **Request basis**: Average + margin; VPA-style — peak + 15%

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Request margin** (%)
- **Limit margin** (%)
- **Overcommit warning above** (× request)
- **VPA margin** (%)
- **VPA minimum** (MiB)

## What you get

- Kubernetes manifest
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/kubernetes/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Kubernetes&title=%5BBug%5D%20Kubernetes%3A%20).
