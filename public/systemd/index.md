# Systemd Memory Limits Calculator

Canonical: [Systemd Memory Limits Calculator](https://memorylimit.dev/systemd/)

Locale: en

Purpose: Right-size memory for systemd services on a VM or bare-metal Linux host. Generates a MemoryHigh / MemoryMax drop-in from real usage data. Free, in your browser.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/vms-bare-metal.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Services that run directly on a VM or bare-metal host have no scheduler reserving memory for them, but systemd can still fence them in with two cgroup settings. `MemoryHigh` is a soft ceiling: above it the service is slowed down and its memory reclaimed aggressively. `MemoryMax` is the hard one: cross it and the kernel OOM-kills the service. This calculator sizes both from real usage and gives you a drop-in file to install.

## Usage data

Paste box: Raw query output or samples.

**Where do I get these numbers?**

If cAdvisor runs on the host, use a **range** query over a representative period (a week is a good default) for the service's cgroup:

```
container_memory_working_set_bytes{id="/system.slice/myapp.service"}
```

Without Prometheus, sample systemd directly and paste the numbers (bytes). `MemoryCurrent` includes page cache, so it reads a little higher than the working set:

```
while sleep 60; do systemctl show -P MemoryCurrent myapp.service; done
```

Enter observed usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **OOMKill sensitivity**: Low — tolerate occasional OOMKills; Medium; High — avoid OOMKills at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Request margin** (%)
- **Limit margin** (%)
- **MemoryMax ratio** (× MemoryHigh)

## What you get

- systemd drop-in (override.conf)
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/systemd/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new/choose).
