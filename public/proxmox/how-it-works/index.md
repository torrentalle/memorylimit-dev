# How the Proxmox VE calculator works

Canonical: [How the Proxmox VE calculator works](https://memorylimit.dev/proxmox/how-it-works/)

Locale: en

Purpose: How the Proxmox VE calculator sets a VM's memory and ballooning minimum: rounding, the balloon rule, auto-ballooning, qm and the web UI, with docs links.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Proxmox VE memory calculator](https://memorylimit.dev/proxmox/index.md)


This page walks through how the [Proxmox VE calculator](https://memorylimit.dev/proxmox/index.md) turns your usage data into a VM's memory and ballooning minimum. Both start from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by the Proxmox documentation or source end with a Proxmox docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## Memory and minimum memory

- **Memory** (`memory`) is the RAM online for the VM, in MiB, and the most it can have when the balloon device is used. It's at least 16 MiB and defaults to 512. [Proxmox source](https://github.com/proxmox/qemu-server/blob/master/src/PVE/QemuServer/Memory.pm)
- **Minimum memory** (`balloon`) is the target RAM for the VM in MiB; 0 turns the balloon driver off. [Proxmox docs](https://pve.proxmox.com/pve-docs/qm.1.html)

With both equal, the VM gets exactly that much. With the minimum lower, Proxmox always keeps the minimum available and adds memory up to the maximum as the host allows. [Proxmox docs](https://pve.proxmox.com/pve-docs/chapter-qm.html) That's the shared model's request and limit, so the minimum comes from the average and memory from the peak.

## From usage to the two values

```
minimum memory = average × (1 + request margin)                      rounded up to a whole MiB
memory         = max(peak × (1 + limit margin), minimum memory, 16)   rounded up to a whole MiB
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too.

Proxmox refuses a balloon value larger than the assigned memory, so when the peak is so close to the average that the peak-based memory falls below the minimum, memory is raised to it. [Proxmox source](https://github.com/proxmox/qemu-server/blob/master/src/PVE/API2/Qemu.pm)

### Worked example

Average 410 MiB, peak 630 MiB, generic workload, medium sensitivity, production:

| minimum memory | 410 MiB × 1.30 = 533 MiB | 533 MiB |
| --- | --- | --- |
| memory | 630 MiB × 1.30 = 819 MiB | 819 MiB |

A steady cache, averaging 1000 MiB with a 1020 MiB peak, where the minimum decides memory:

| minimum memory | 1000 MiB × 1.35 = 1350 MiB | 1350 MiB |
| --- | --- | --- |
| memory | 1020 MiB × 1.30 = 1326 MiB, below the minimum | 1350 MiB |

## Auto-ballooning

- While host RAM usage is below a target, 80% by default, Proxmox adds memory to the guest up to its maximum. When the host needs memory back, the guest's balloon driver gives it up, which can make the guest swap or, as a last resort, run its OOM killer. [Proxmox docs](https://pve.proxmox.com/pve-docs/chapter-qm.html)
- Linux distributions released after 2010 include the balloon driver. On Windows it has to be installed, can slow the guest down, and isn't recommended for critical systems. Leave about 1 GB of RAM for the host itself. [Proxmox docs](https://pve.proxmox.com/pve-docs/chapter-qm.html)

So the minimum is what the VM can count on, and the memory above it is only there while the host has room. The calculator assumes ballooning is on; with it off, set both values to the memory result. [Assumption](#all-assumptions-in-one-place)

## What the calculator writes

```
qm set <vmid> --memory 819 --balloon 533
```

- `qm set` takes `--memory` and `--balloon`, both in MiB. [Proxmox docs](https://pve.proxmox.com/pve-docs/qm.1.html)
- In the web UI, the same values are *Memory (MiB)* and, under Advanced, *Minimum memory (MiB)* with *Ballooning Device* on. [Proxmox source](https://github.com/proxmox/pve-manager/blob/master/www/manager6/qemu/MemoryEdit.js)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Memory raised to the minimum warning | The peak-based memory came out below the minimum | Proxmox refuses a balloon above memory. [Proxmox source](https://github.com/proxmox/qemu-server/blob/master/src/PVE/API2/Qemu.pm) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
node_memory_MemTotal_bytes{instance="vm1:9100"}
  - node_memory_MemAvailable_bytes{instance="vm1:9100"}
```

- Measured inside the guest with node_exporter: total memory minus `MemAvailable`, the kernel's estimate of memory available for new applications without swapping. [Kernel docs](https://docs.kernel.org/filesystems/proc.html)
- With ballooning active, the host's view shows what Proxmox lent the VM rather than what it needed, so the calculator asks for the guest's own numbers. [Assumption](#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Ballooning is on | About your setup | The minimum only means something with the balloon driver | Without it the VM has the full memory all the time; set both values to the memory result. |
| Measure inside the guest | Our default | The host sees what it lent the VM, not what the VM needed | Host-side numbers would size the VM to whatever ballooning gave it. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the minimum memory (`balloon`) |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the memory |

## References

- [QEMU/KVM virtual machines](https://pve.proxmox.com/pve-docs/chapter-qm.html) — memory, minimum memory and auto-ballooning.
- [`qm`](https://pve.proxmox.com/pve-docs/qm.1.html) — `--memory` and `--balloon`.
- [qemu-server: Memory.pm](https://github.com/proxmox/qemu-server/blob/master/src/PVE/QemuServer/Memory.pm) — memory in MiB, 16 minimum, 512 default.
- [qemu-server: Qemu.pm](https://github.com/proxmox/qemu-server/blob/master/src/PVE/API2/Qemu.pm) — the balloon may not exceed memory.
- [pve-manager: MemoryEdit.js](https://github.com/proxmox/pve-manager/blob/master/www/manager6/qemu/MemoryEdit.js) — the web UI fields.
- [The /proc filesystem](https://docs.kernel.org/filesystems/proc.html) (kernel) — `MemAvailable`.

[← Back to the Proxmox VE calculator](https://memorylimit.dev/proxmox/index.md)
