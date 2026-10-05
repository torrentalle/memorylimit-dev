# How the VMware vSphere calculator works

Canonical: [How the VMware vSphere calculator works](https://memorylimit.dev/vmware/how-it-works/)

Locale: en

Purpose: How the vSphere calculator sets a VM's memory size, reservation and shares the way VMware advises, with no limit: rounding, govc, hot add, and what to paste, with links to the vSphere docs.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← VMware vSphere memory calculator](https://memorylimit.dev/vmware/index.md)

This page walks through how the [vSphere calculator](https://memorylimit.dev/vmware/index.md) turns your usage data into a VM's memory size, reservation and shares, following VMware's own advice. The values start from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by VMware's documentation end with a vSphere docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## Memory, reservation, limit and shares

- **Reservation** is the guaranteed minimum allocation, in megabytes. A VM whose reservation can't be met doesn't power on, and a reservation can't be larger than the VM's configured memory. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevsphere-vm-admin/virtual-memory-configurationvsphere-vm-admin/allocate-memory-resourcesvsphere-vm-admin.html)
- **Limit** is the upper bound, in megabytes. With no limit, the VM's configured memory is its effective limit. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/9-0/vsphere-resource-management/configuring-resource-allocation-settings.html) In the API, a limit of −1 means exactly that. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere-sdks-tools/7-0/web-services-sdk-programming-guide/virtual-machine-configuration/configuring-a-virtual-machine/cpu-and-memory-information/configuring-resource-allocation-constraints-for-virtual-machines.html)
- **Shares** set a VM's priority against the others when memory is contended: High, Normal and Low are 20, 10 and 5 shares per megabyte of configured memory. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/7-0/vsphere-resource-management/configuring-resource-allocation-settings/resource-allocation-shares.html)

## VMware's advice, and how the calculator follows it

VMware's resource-management guidance: [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/9-0/vsphere-resource-management/configuring-resource-allocation-settings.html)

- A limit can waste idle memory: the VM can't use more than the limit even when the host has plenty.
- Reserve the *minimum acceptable* amount of memory, not the amount you'd like to have available.
- Leave at least 10% of the host unreserved, so later changes still fit.

So the calculator sets no limit and sizes the VM's **configured memory** from the peak instead: that becomes the cap. The reservation comes from the average plus its margin, the memory the VM needs under normal load, which is how the calculator reads "minimum acceptable". [Assumption](https://memorylimit.dev/vmware/how-it-works/index.md#all-assumptions-in-one-place)

## From usage to memory and reservation

```
reservation = average × (1 + request margin)                  rounded up to a whole MB
memory      = max(peak × (1 + limit margin), reservation)     rounded up to a multiple of 4 MB
limit       = Unlimited (−1)
shares      = Normal
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too. vSphere's MB are taken as MiB, so values pass through unconverted. [Assumption](https://memorylimit.dev/vmware/how-it-works/index.md#all-assumptions-in-one-place) A reservation can't exceed the configured memory, so when the peak is so close to the average that the peak-based memory falls below the reservation, the memory is raised to it. The memory size must be a multiple of 4 MB, so it is rounded up to the next one; the reservation takes any whole MB. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevsphere-vm-admin/virtual-memory-configurationvsphere-vm-admin/change-the-memory-configurationvsphere-vm-admin.html)

### Worked example

Average 390 MiB, peak 700 MiB, generic workload, medium sensitivity, production:

| memory | 700 MiB × 1.30 = 910 MiB, up to a multiple of 4 | 912 MB |
| --- | --- | --- |
| reservation | 390 MiB × 1.30 = 507 MiB | 507 MB |
| limit | none | Unlimited |

A steady cache, averaging 1000 MiB with a 1020 MiB peak, where the reservation decides the memory:

| reservation | 1000 MiB × 1.35 = 1350 MiB | 1350 MB |
| --- | --- | --- |
| memory | 1020 MiB × 1.30 = 1326 MiB, below the reservation, so 1350 MiB up to a multiple of 4 | 1352 MB |

## What the calculator writes

```
govc vm.change -vm "<vm-name>" -m 912 -mem.reservation 507 -mem.limit -1 -mem.shares normal
```

- `govc vm.change` takes the memory size with `-m`, and the reservation and limit with `-mem.reservation` and `-mem.limit`, all in MB; shares as a level or a number. [govc docs](https://github.com/vmware/govmomi/blob/main/govc/USAGE.md) The same values go in the vSphere Client under Edit Settings → Virtual Hardware → Memory.
- Memory hot add lets you add memory to a powered-on VM; turning it on needs the VM powered off. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/7-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevm-admin/virtual-memory-configurationvm-admin/change-memory-hot-add-settingsvm-admin.html) Lowering a VM's memory isn't covered by hot add, so it needs the VM off. [Assumption](https://memorylimit.dev/vmware/how-it-works/index.md#all-assumptions-in-one-place)
- Shares stay at Normal: the calculator has no way to know how this VM should rank against its neighbours, and doesn't claim Normal is vSphere's default. [Assumption](https://memorylimit.dev/vmware/how-it-works/index.md#all-assumptions-in-one-place)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Memory raised to the reservation warning | The peak-based memory came out below the reservation | A reservation can't be larger than the configured memory. [vSphere docs](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevsphere-vm-admin/virtual-memory-configurationvsphere-vm-admin/allocate-memory-resourcesvsphere-vm-admin.html) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
node_memory_MemTotal_bytes{instance="vm1:9100"}
  - node_memory_MemAvailable_bytes{instance="vm1:9100"}
```

- Measured inside the guest with node_exporter: total memory minus `MemAvailable`, the kernel's estimate of memory available for new applications without swapping. [Kernel docs](https://docs.kernel.org/filesystems/proc.html)
- The calculator asks for guest-side numbers rather than vSphere's own "active" or "consumed" memory, which describe the host's view of the VM rather than what the guest needs. [Assumption](https://memorylimit.dev/vmware/how-it-works/index.md#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| vSphere's MB are MiB | Our reading | vSphere sizes memory in powers of two and never defines MB | If they were decimal, values would be about 5% too small. |
| "Minimum acceptable" is the average plus its margin | Our reading | It's the memory the VM needs under normal load | A VM that runs acceptably on less can reserve less, leaving more of the host unreserved. |
| Shares stay at Normal | Our default | Priority between VMs isn't something usage data shows | Under contention, this VM gets the same share per MB as other Normal VMs. |
| Lowering memory needs the VM off | Our reading | Hot add only adds memory | If your setup can remove memory live, you won't need the restart. |
| Measure inside the guest | Our default | The guest's own view is what the application needs | Host-side figures can read lower or higher than what the guest uses. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the reservation |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the VM’s memory |

## References

- [Configure resource allocation settings](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/9-0/vsphere-resource-management/configuring-resource-allocation-settings.html) — reservation, limit, and VMware's advice on both.
- [Allocate memory resources](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevsphere-vm-admin/virtual-memory-configurationvsphere-vm-admin/allocate-memory-resourcesvsphere-vm-admin.html) — units and the reservation's limits.
- [Resource allocation constraints (SDK)](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere-sdks-tools/7-0/web-services-sdk-programming-guide/virtual-machine-configuration/configuring-a-virtual-machine/cpu-and-memory-information/configuring-resource-allocation-constraints-for-virtual-machines.html) — −1 for no limit.
- [Resource allocation shares](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/7-0/vsphere-resource-management/configuring-resource-allocation-settings/resource-allocation-shares.html) — High, Normal, Low.
- [Change memory hot add settings](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/7-0/vsphere-virtual-machine-administration/configuring-virtual-machine-hardwarevm-admin/virtual-memory-configurationvm-admin/change-memory-hot-add-settingsvm-admin.html) — adding memory to a running VM.
- [govc USAGE](https://github.com/vmware/govmomi/blob/main/govc/USAGE.md) — `vm.change` flags.
- [The /proc filesystem](https://docs.kernel.org/filesystems/proc.html) (kernel) — `MemTotal` and `MemAvailable`.

[← Back to the vSphere calculator](https://memorylimit.dev/vmware/index.md)
