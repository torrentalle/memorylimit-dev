# How the Kubernetes calculator works

Canonical: [How the Kubernetes calculator works](https://memorylimit.dev/kubernetes/how-it-works/)

Locale: en

Purpose: How the Kubernetes calculator sets memory requests and limits: rounding, the limit floor, Guaranteed QoS, every warning, and how it compares with the Vertical Pod Autoscaler, with links to the Kubernetes docs.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Kubernetes memory limit calculator](https://memorylimit.dev/kubernetes/index.md)

This page walks through how the [Kubernetes calculator](https://memorylimit.dev/kubernetes/index.md) turns your usage data into `resources.requests.memory` and `resources.limits.memory`. The request and limit start from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by the documentation end with a Kubernetes docs link to the page that says so. Choices the documentation doesn't make for us are explained and marked Assumption, which links to the table of all of them.

## What the two settings do

- **The request** is what the scheduler uses to choose a node, and a container may use more than it when the node has memory to spare. [Kubernetes docs](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- **The limit** is enforced by the kernel: a container that goes over it may be OOM-killed. [Kubernetes docs](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- **When a node runs short of memory**, the kubelet evicts Pods, and only Pods using more than their requests are candidates. BestEffort Pods go first, then Burstable, then Guaranteed. [Kubernetes docs](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)

The calculator writes both settings for one container, in `Mi` (mebibytes), one of the suffixes the documentation lists for memory. Values are rounded up to a whole Mi.

## Burstable: request and limit

```
request = average × (1 + request margin)                 rounded up to a whole Mi
limit   = max(peak × (1 + limit margin), request)        rounded up to a whole Mi
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too.

A request can't be larger than its limit: the API rejects it. So when the peak is so close to the average that the peak-based limit falls below the request, the limit is raised to the request. [Kubernetes docs](https://github.com/kubernetes/kubernetes/blob/master/pkg/apis/core/validation/validation.go)

### Worked example

Average 410 MiB, peak 630 MiB, generic workload, medium sensitivity, production, 3 replicas:

| request | 410 MiB × 1.30 = 533 MiB | 533Mi |
| --- | --- | --- |
| limit | 630 MiB × 1.30 = 819 MiB, above the request | 819Mi |
| total request | 533Mi × 3 replicas | 1599Mi |

When the peak is close to the average, the request can decide the limit. Average 1000 MiB and peak 1010 MiB, high sensitivity:

| request | 1000 MiB × 1.50 = 1500 MiB | 1500Mi |
| --- | --- | --- |
| limit | 1010 MiB × 1.40 = 1414 MiB, below the request | 1500Mi |

## Guaranteed: request equal to limit

```
request = limit = max(peak × (1 + limit margin),
                      average × (1 + request margin))
                  rounded up to a whole Mi
```

A Pod is Guaranteed only if every container has a memory request equal to its memory limit *and* a CPU request equal to its CPU limit. The calculator only writes memory, so the note under the result reminds you to set CPU the same way; without it the Pod stays Burstable. [Kubernetes docs](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)

Google's GKE guidance recommends the same amount of memory for the request and the limit, because memory can't be compressed: when it runs out, the Pod has to be taken down. [GKE docs](https://docs.cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke) The calculator still defaults to Burstable, which packs more Pods per node; choose Guaranteed for workloads that mustn't be evicted. [Assumption](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place)

| request = limit | 630 MiB × 1.30 = 819 MiB, the larger of 819 and 533 MiB | 819Mi |
| --- | --- | --- |
| total request | 819Mi × 3 replicas | 2457Mi |

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Limit far above the request warning | The limit is more than 4× the request | The scheduler places Pods by their requests, and under node memory pressure Pods above their requests are evicted first. [Kubernetes docs](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/) A LimitRange can cap the ratio (`maxLimitRequestRatio`) but has no default. [Kubernetes docs](https://kubernetes.io/docs/reference/kubernetes-api/policy-resources/limit-range-v1/) The 4× threshold is ours. [Assumption](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

For example, a worker averaging 100 MiB with a 600 MiB peak, at high sensitivity:

| request | 100 MiB × 1.40 | 140Mi |
| --- | --- | --- |
| limit | 600 MiB × 1.75 | 1050Mi |
| limit ÷ request | above 4, so the warning shows | 7.5× |

## Compared with the Vertical Pod Autoscaler

Kubernetes itself doesn't publish a formula for memory requests. Its [Vertical Pod Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler) (VPA), maintained by the Kubernetes autoscaling group, does recommend one. Its defaults ([recommender flags](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/flags.md)):

| VPA recommender | Default |
| --- | --- |
| Peak memory usage is taken per interval of | 24 hours (`memory-aggregation-interval`), over 8 intervals |
| Target is this percentile of those peaks | 90th (`target-memory-percentile`) |
| Safety margin added to the recommended request | 15% (`recommendation-margin-fraction`) |
| Minimum recommendation per Pod | 250 MB (`pod-recommendation-min-memory-mb`) |
| Memory bump-up when an OOM kill occurs | ratio 1.2 (`oom-bump-up-ratio`), at least 100 MiB (`oom-min-bump-up-bytes`) |

When VPA also sets limits, it keeps each container's limit-to-request ratio. [Kubernetes docs](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/features.md)

The difference that matters: VPA sizes the **request from daily peaks**, while this calculator sizes it from the **average**. So VPA would recommend a higher request, and a Pod sized here spends more of its time above its request, where it can be evicted under node memory pressure. The calculator keeps the average because it works from as few as one or two samples; reproducing VPA needs at least a day of samples with timestamps. If eviction is a concern, choose a higher sensitivity or Guaranteed QoS, or let VPA size the request once the workload has history. [Assumption](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place)

### Request basis: VPA-style

The calculator's *Request basis* field can size the request the way VPA does instead. VPA's recommender adds its 15% margin to the memory target and never recommends less than 250 MiB for a Pod, split between its containers. [Kubernetes source](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/pkg/recommender/logic/recommender.go)

```
request = max(peak × 1.15, 250 MiB)    rounded up to a whole Mi
limit   = max(peak × (1 + limit margin), request)
```

VPA's target is the 90th percentile of daily peaks; with only a peak to go on, the calculator uses the peak, which is at least as high, so the request comes out at or above what VPA would set. [Assumption](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place) The sensitivity, workload and environment margins don't apply to the request in this mode, only to the limit. The 250 MiB minimum is applied in full, as if the Pod had one container. [Assumption](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place)

| request | 630 MiB × 1.15 = 724.5 MiB | 725Mi |
| --- | --- | --- |
| limit | 630 MiB × 1.30 = 819 MiB | 819Mi |
| total request | 725Mi × 3 replicas | 2175Mi |

## What to paste

```
container_memory_working_set_bytes{namespace="prod", container="api"}
```

- `container_memory_working_set_bytes` is a gauge of the container's current working set, in bytes. [cAdvisor docs](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md)
- The working set is what the kubelet measures to decide when a node is short of memory, which is why it's the metric to size from. [Kubernetes docs](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) `container_memory_usage_bytes` instead counts all memory "regardless of when it was accessed", as cAdvisor puts it.
- A range query over a representative period (a week is a good default) gives the best average and peak. Series with `container=""` (the whole Pod) and `container="POD"` (the pause container) are skipped. These are the label values cAdvisor commonly exports for them; we haven't found them documented. [Assumption](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Warn when the limit is over 4× the request | Our default | A judgment call on when overcommit makes evictions likely | Only the warning moves; a LimitRange in your namespace may set a stricter cap. |
| The request comes from the average, not from daily peaks like VPA | Our default | Works with few samples | The Pod is more often above its request, so more likely to be evicted under node pressure; choose VPA-style as the request basis to avoid it. |
| Burstable by default | Our default | Packs more Pods per node | GKE recommends request = limit for memory; choose Guaranteed for workloads that mustn't be evicted. |
| `container=""` and `container="POD"` are Pod-level and pause series | Our reading | What cAdvisor commonly exports | If your setup labels them differently, they're averaged in and skew the result; filter them out in the query. |
| VPA-style uses the peak as VPA's target | Our default | The calculator has a peak, not 8 days of daily peaks | The request is at or a little above what VPA would recommend. |
| VPA's 250 MiB minimum goes to one container | About your setup | VPA splits it between a Pod's containers; the calculator sizes one | In a multi-container Pod, VPA would give each container only its share of 250 MiB. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the request |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the limit |
| Overcommit warning above | 4× the request | 1–20× | Our default, [assumption 1](https://memorylimit.dev/kubernetes/how-it-works/index.md#all-assumptions-in-one-place); only moves the warning |
| VPA margin (VPA-style only) | 15% | 0–100% | The VPA recommender’s `recommendation-margin-fraction` default ([flags](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/flags.md)); set your cluster’s value if it changes it |
| VPA minimum (VPA-style only) | 250 MiB | 0–4,096 MiB | The VPA recommender’s `pod-recommendation-min-memory-mb` default ([flags](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/flags.md)) |

## References

- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests, limits, OOM kills and memory units.
- [Pod Quality of Service Classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/) — what makes a Pod Guaranteed or Burstable, and eviction order.
- [Node-pressure Eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) — the working set and how the kubelet decides a node is short of memory.
- [LimitRange](https://kubernetes.io/docs/reference/kubernetes-api/policy-resources/limit-range-v1/) — `maxLimitRequestRatio`, the per-namespace cap on limit ÷ request.
- [Container resource validation](https://github.com/kubernetes/kubernetes/blob/master/pkg/apis/core/validation/validation.go) (Kubernetes source) — a request must not exceed its limit.
- [VPA recommender flags](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/flags.md) and [features](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/features.md) — how VPA sizes memory.
- [Best practices for running cost-optimized Kubernetes applications on GKE](https://docs.cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke) — request equal to limit for memory.
- [cAdvisor Prometheus metrics](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md) — `container_memory_working_set_bytes`.

[← Back to the Kubernetes calculator](https://memorylimit.dev/kubernetes/index.md)
