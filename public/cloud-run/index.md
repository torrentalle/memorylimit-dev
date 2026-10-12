# Google Cloud Run Memory Limit Calculator

Canonical: [Google Cloud Run Memory Limit Calculator](https://memorylimit.dev/cloud-run/)

Locale: en

Purpose: Pick the right Google Cloud Run memory limit from real usage, with the minimum CPU it requires. Avoid out-of-memory restarts without overpaying.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/serverless.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Cloud Run gives each instance a single memory limit; an instance that exceeds it is shut down and its in-flight requests fail. How much memory an instance needs depends on how many requests it serves at once, and sizes above 4 GiB also need more vCPUs. This calculator sizes the limit from peak usage and adds the CPU Cloud Run requires for it.

## Usage data

Paste box: Per-instance memory samples.

**Where do I get these numbers?**

Cloud Monitoring charts Cloud Run memory as a **share of the current limit**, not in bytes. Multiply the service's "Container memory utilization" p50 and p99 over a representative period by its current limit, and enter them under *Manual values*. Only the p99 (the peak) changes the result.

If you export container metrics to Prometheus, or have per-instance values with units (`412 MiB`), paste those here instead.

Enter observed per-instance usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **OOM sensitivity**: Low — tolerate occasional instance restarts; Medium; High — avoid out-of-memory restarts at all cost
- **Environment**: Development; Staging; Production
- **Idle memory per instance** (MiB)
- **Max concurrency now**
- **Max concurrency planned**

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Limit margin** (%)

## Memory limit, CPU and concurrency in short

Each instance gets one memory limit, 512 MiB by default, up to 32 GiB; an instance that exceeds it is terminated. The container's filesystem is in memory, so files it writes use the instance's memory too. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)

With no separate reservation and running out ending the instance, the calculator sizes the limit from the **peak** alone; the average doesn't change the result. The margin is MemoryLimit's own default; you can change it under *Advanced*.

Google's own formula counts requests: standing memory plus memory per request times concurrency. The calculator applies it when you enter the instance's idle memory and the concurrency now and planned. Up to 4 GiB it leaves CPU at the default 1 vCPU; above that it adds the fewest vCPU the memory needs. [Cloud Run docs](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)

**Common input mistakes**

- Using the utilization metric as if it were MiB: we read it as a share of the instance's current limit, so multiply its p99 by that limit to get the peak in MiB.
- Planning a higher concurrency without entering the idle memory: the whole peak counts as per-request memory, so the result is an upper bound.
- A measured peak taken with fewer requests in flight than the maximum concurrency you entered: memory per request, and the planned memory, come out low.

Full derivation, warnings and every assumption: [how the Cloud Run calculator works](https://memorylimit.dev/cloud-run/how-it-works/index.md). The shared formula and margin tables: [the sizing model](https://memorylimit.dev/sizing-model/index.md).

Related calculators:

- [AWS Lambda](https://memorylimit.dev/lambda/index.md)
- [Azure Functions](https://memorylimit.dev/azure-functions/index.md)

## What you get

- gcloud command
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/cloud-run/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Google%20Cloud%20Run&title=%5BBug%5D%20Google%20Cloud%20Run%3A%20).
