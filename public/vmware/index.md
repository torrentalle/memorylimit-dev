# VMware vSphere Memory Sizing Calculator

Canonical: [VMware vSphere Memory Sizing Calculator](https://memorylimit.dev/vmware/)

Locale: en

Purpose: Right-size a vSphere VM's memory and reservation from real usage data, the way VMware advises. Outputs vSphere Client steps and a govc command.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/vms.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

vSphere gives each VM a configured memory size and three controls: the **reservation** the host guarantees, a **limit** it can't use more than, and **shares** that decide who wins when VMs compete for memory. VMware advises against limits, since they can waste idle memory, so this calculator follows that: it sizes the VM's **memory** from the peak, as the cap, and the **reservation** from the average, with the limit left unlimited.

## Usage data

Paste box: Raw query output / samples.

**Where do I get these numbers?**

Measure from inside the guest: vSphere's own "active" memory underestimates what the OS needs, and "consumed" never shrinks. With node_exporter, run a **range** query over a representative period (a week is a good default):

```
node_memory_MemTotal_bytes{instance="vm1:9100"}
  - node_memory_MemAvailable_bytes{instance="vm1:9100"}
```

Paste the Prometheus UI table output, the HTTP API JSON, or a Grafana CSV export.

Enter observed usage directly, in MiB (vSphere's "MB").

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

- govc command
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/vmware/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=VMware%20vSphere&title=%5BBug%5D%20VMware%20vSphere%3A%20).
