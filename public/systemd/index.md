# Systemd Memory Limits Calculator

Canonical: [Systemd Memory Limits Calculator](https://memorylimit.dev/systemd/)

Locale: en

Purpose: Right-size memory for systemd services on a VM or bare-metal Linux host. Generates a MemoryHigh / MemoryMax drop-in from real usage data. Free, in your browser.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/vms.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Services that run directly on a VM or bare-metal host have no scheduler reserving memory for them, but systemd can still fence them in with two cgroup settings. `MemoryHigh` is a soft ceiling: above it the service is slowed down and its memory reclaimed aggressively. `MemoryMax` is the hard one: cross it and the kernel OOM-kills the service. This calculator sizes both from real usage and gives you a drop-in file to install.

## Usage data

Paste box: Raw query output / samples.

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

## MemoryHigh and MemoryMax in short

`MemoryHigh` is the throttling limit: above it the service's processes are heavily slowed down and memory is taken away aggressively. `MemoryMax` is the absolute limit: if usage can't be kept under it, the OOM killer runs inside the unit, and systemd recommends it as the last line of defense. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)

The calculator sets `MemoryHigh` just above the observed **peak** and `MemoryMax` at 1.25 × `MemoryHigh`. Neither systemd nor the cgroup v2 documentation gives a ratio, so 1.25 is MemoryLimit's own default; you can change it under *Advanced*. The average-based figure is shown as expected usage, for reference only.

Both settings control cgroup v2. Since systemd 258, cgroup v1 isn't supported at all; older hosts still on it only have the deprecated `MemoryLimit=`. [systemd NEWS](https://github.com/systemd/systemd/blob/main/NEWS)

**Common input mistakes**

- Reading `MemoryCurrent` as the working set: we read it as the unit's `memory.current`, which counts page cache too, so it reads a little higher.
- Using the wrong cgroup id in a cAdvisor query: a service is `/system.slice/<name>.service`.
- A window that misses the busiest times: `MemoryHigh` comes out too low and the service is throttled early.

Full derivation, warnings and every assumption: [how the systemd calculator works](https://memorylimit.dev/systemd/how-it-works/index.md). The shared formula and margin tables: [the sizing model](https://memorylimit.dev/sizing-model/index.md).

Related calculators:

- [VMware vSphere](https://memorylimit.dev/vmware/index.md)
- [Proxmox VE](https://memorylimit.dev/proxmox/index.md)

## What you get

- systemd drop-in (override.conf)
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/systemd/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Systemd%20%2F%20Bare%20Metal%20%2F%20VM&title=%5BBug%5D%20Systemd%20%2F%20Bare%20Metal%20%2F%20VM%3A%20).
