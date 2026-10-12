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

## Memory, reservation and limit in short

A **reservation** is the guaranteed minimum allocation: a VM whose reservation can't be met doesn't power on, and a reservation can't be larger than the VM's configured memory. With no **limit**, the VM's configured memory is its effective limit. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/9-0/vsphere-resource-management/configuring-resource-allocation-settings.html)

VMware advises that a limit can waste idle memory, that you reserve the minimum acceptable amount, and that you leave at least 10% of the host unreserved. So the calculator sets no limit, sizes the VM's configured memory from the **peak** and the reservation from the **average** plus its margin, which is our reading of "minimum acceptable". The margins are MemoryLimit's own defaults and can be changed under *Advanced*.

Memory hot add lets you add memory to a powered-on VM, but lowering a VM's memory isn't covered by it, so we assume that needs the VM off. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/7-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevm-admin/virtual-memory-configurationvm-admin/change-memory-hot-add-settingsvm-admin.html)

**Common input mistakes**

- Pasting vSphere's "active" or "consumed" memory: those describe the host's view of the VM; measure inside the guest instead.
- Reserving the peak: VMware advises reserving the minimum acceptable amount, not the amount you would like to have available.
- A window that misses the busiest times: the VM's memory comes out too low.

Full derivation, warnings and every assumption: [how the VMware vSphere calculator works](https://memorylimit.dev/vmware/how-it-works/index.md). The shared formula and margin tables: [the sizing model](https://memorylimit.dev/sizing-model/index.md).

Related calculators:

- [Systemd / Bare Metal / VM](https://memorylimit.dev/systemd/index.md)
- [Proxmox VE](https://memorylimit.dev/proxmox/index.md)

## What you get

- govc command
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/vmware/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=VMware%20vSphere&title=%5BBug%5D%20VMware%20vSphere%3A%20).
