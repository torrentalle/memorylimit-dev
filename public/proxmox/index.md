# Proxmox VE Memory Calculator

Canonical: [Proxmox VE Memory Calculator](https://memorylimit.dev/proxmox/)

Locale: en

Purpose: Set a Proxmox VE VM's memory and ballooning minimum from real usage data. Outputs the qm command and web UI steps — useful when migrating VMs from VMware.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/vms.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Proxmox VE sizes a VM with two numbers: the **memory** it can grow to, and a **minimum** the balloon driver never takes away. Between the two, the host lends the VM memory while it has RAM to spare and reclaims it when it doesn't — the VM slows down rather than crashing, much like vSphere. This calculator sizes both from real usage, which helps when moving VMs over from VMware.

## Usage data

Paste box: Raw query output / samples.

**Where do I get these numbers?**

Measure from inside the guest — with ballooning active, the host's view reflects what Proxmox lent the VM, not what it needed. With node_exporter, run a **range** query over a representative period (a week is a good default):

```
node_memory_MemTotal_bytes{instance="vm1:9100"}
  - node_memory_MemAvailable_bytes{instance="vm1:9100"}
```

Paste the Prometheus UI table output, the HTTP API JSON, or a Grafana CSV export.

Enter observed usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **Memory-pressure sensitivity**: Low — occasional ballooning is fine; Medium; High — avoid ballooning at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Request margin** (%)
- **Limit margin** (%)

## What you get

- qm command
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/proxmox/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Proxmox%20VE&title=%5BBug%5D%20Proxmox%20VE%3A%20).
