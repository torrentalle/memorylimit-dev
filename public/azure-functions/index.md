# Azure Functions Memory Calculator

Canonical: [Azure Functions Memory Calculator](https://memorylimit.dev/azure-functions/)

Locale: en

Purpose: Pick the right Azure Functions instance size from real usage: the Flex Consumption memory setting, or the Elastic Premium SKU when you need more. Avoid out-of-memory restarts without overpaying.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/serverless.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Azure Functions doesn't take a free-form memory value: the hosting plan fixes the instance size. Flex Consumption offers 512, 2048 and 4096 MB instances, and anything larger needs an Elastic Premium SKU (EP1–EP3). An instance that runs out of memory is recycled and its in-flight executions fail. This calculator sizes from peak usage and picks the smallest instance that fits.

## Usage data

Paste box: Per-instance memory samples.

**Where do I get these numbers?**

In Azure Monitor metrics for your function app, use **Memory working set** (take its maximum for the peak) and **Average memory working set**, split by instance. Microsoft documents both for Flex Consumption, and lists them, along with **Private Bytes**, for function apps in general (not on the legacy Linux Consumption plan). Enter the values under *Manual values*.

Per-instance samples with units (`412 MiB`), or Prometheus output from a container-hosted app, can be pasted here instead.

Enter observed per-instance usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **OOM sensitivity**: Low — tolerate occasional instance recycles; Medium; High — avoid out-of-memory recycles at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Limit margin** (%)
- **Minimum instance size**: 512 MB; 2,048 MB — Microsoft’s suggestion; 4,096 MB

## What you get

- Azure CLI command
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/azure-functions/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Azure%20Functions&title=%5BBug%5D%20Azure%20Functions%3A%20).
