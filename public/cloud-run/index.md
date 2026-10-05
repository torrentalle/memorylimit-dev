# Google Cloud Run Memory Limit Calculator

Canonical: [Google Cloud Run Memory Limit Calculator](https://memorylimit.dev/cloud-run/)

Locale: en

Purpose: Pick the right Google Cloud Run memory limit from real instance usage, with the minimum CPU Cloud Run requires for it. Avoid out-of-memory instance restarts without overpaying.

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

## What you get

- gcloud command
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/cloud-run/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Google%20Cloud%20Run&title=%5BBug%5D%20Google%20Cloud%20Run%3A%20).
