# How the systemd calculator works

Canonical: [How the systemd calculator works](https://memorylimit.dev/systemd/how-it-works/)

Locale: en

Purpose: How the systemd calculator sets MemoryHigh and MemoryMax: systemd's own advice, the 1.25× gap, cgroup v2, the drop-in and set-property, and what to paste, with links to the systemd and kernel docs.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Systemd memory limits calculator](https://memorylimit.dev/systemd/index.md)

This page walks through how the [systemd calculator](https://memorylimit.dev/systemd/index.md) turns your usage data into a service's `MemoryHigh` and `MemoryMax`. Both start from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by the systemd or kernel documentation end with a systemd docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## What the two settings do

- **`MemoryHigh`** is the throttling limit: above it the service's processes are heavily slowed down and memory is taken away aggressively. systemd calls it the main mechanism to control a unit's memory. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
- **`MemoryMax`** is the absolute limit: if usage can't be kept under it, the OOM killer runs inside the unit. systemd recommends it as the last line of defense. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)

They set the kernel's `memory.high` and `memory.max`. The kernel's own documentation calls `memory.max` the main way to limit a cgroup's memory; systemd's advice is the one the calculator follows, because it's about services. [Kernel docs](https://docs.kernel.org/admin-guide/cgroup-v2.html)

There's no scheduler, so nothing reserves memory for the service: the average-based value is shown as *expected usage*, for reference only.

## MemoryHigh, MemoryMax and expected usage

```
expected usage = average × (1 + request margin)                     rounded up to a whole M
MemoryHigh     = max(peak × (1 + limit margin), expected usage)     rounded up to a whole M
MemoryMax      = 1.25 × MemoryHigh                                   rounded up to a whole M
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too. systemd reads the `M` suffix with base 1024, so `M` is MiB. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)

- `MemoryHigh` sits just above the observed peak, so normal peaks run unthrottled and throttling only starts when usage grows past anything seen so far, typically a leak. It never goes below expected usage, so a steady service isn't throttled at its normal level. [Assumption](https://memorylimit.dev/systemd/how-it-works/index.md#all-assumptions-in-one-place)
- `MemoryMax` is 25% above `MemoryHigh`, so `MemoryHigh` sits 20% below it. The gap is warning time: a leak slows the service down before the kernel kills it. Neither systemd nor the cgroup v2 memory controller's own documentation gives a ratio: both treat the high limit as the main control and the max as a final safety net, which by default isn't set at all. [cgroup2 docs](https://facebookmicrosites.github.io/cgroup2/docs/memory-controller.html) 1.25× is ours, at the low end of what guides outside the official documentation commonly suggest: the high limit 20–30% below the max (1.25–1.43×). [Assumption](https://memorylimit.dev/systemd/how-it-works/index.md#all-assumptions-in-one-place)

### Worked example

Average 295 MiB, peak 390 MiB, generic workload, medium sensitivity, production:

| MemoryHigh | 390 MiB × 1.30 = 507 MiB | 507M |
| --- | --- | --- |
| MemoryMax | 1.25 × 507 = 633.75 | 634M |
| expected usage | 295 MiB × 1.30 = 383.5 MiB | 384M |

A steady cache, averaging 1000 MiB with a 1020 MiB peak, where expected usage decides MemoryHigh:

| expected usage | 1000 MiB × 1.35 | 1350M |
| --- | --- | --- |
| MemoryHigh | 1020 MiB × 1.30 = 1326 MiB, below expected usage | 1350M |
| MemoryMax | 1.25 × 1350 = 1687.5 | 1688M |

## What the calculator writes

```
[Service]
MemoryHigh=507M
MemoryMax=634M
```

- Saved as `/etc/systemd/system/<service>.service.d/override.conf`, it's a drop-in: systemd reads every `.conf` file in the unit's `.service.d/` directory on top of the unit file. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html) Then `systemctl daemon-reload && systemctl restart <service>`.
- Or, without a restart: `systemctl set-property <service>.service MemoryHigh=507M MemoryMax=634M` changes resource settings at runtime and keeps them for future boots. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)

## cgroup v2 only

Both settings control the memory controller of the unified hierarchy, cgroup v2. [systemd docs](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html) Since systemd 258, cgroup v1 isn't supported at all. On older hosts still running it, the only setting is `MemoryLimit=`, deprecated since systemd 252. [systemd NEWS](https://github.com/systemd/systemd/blob/main/NEWS)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
container_memory_working_set_bytes{id="/system.slice/myapp.service"}
```

- With cAdvisor on the host, its `id` label is the cgroup path, so a service is `/system.slice/<name>.service`. [cAdvisor source](https://github.com/google/cadvisor/blob/master/lib/metrics/prometheus.go)
- Without Prometheus, sample `systemctl show -P MemoryCurrent myapp.service` every minute and paste the bytes. `MemoryCurrent` reports the unit's `memory.current`, the cgroup's total usage, which counts page cache too; so it reads a little higher than the working set. [Kernel docs](https://docs.kernel.org/admin-guide/cgroup-v2.html) systemd's documentation lists the property without describing it. [Assumption](https://memorylimit.dev/systemd/how-it-works/index.md#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| MemoryMax is 1.25× MemoryHigh | Our default | Leaves warning time between throttling and an OOM kill; no official source gives a ratio | A smaller gap kills sooner after throttling starts; a larger one lets a leak take more of the host first. |
| MemoryHigh never goes below expected usage | Our default | A steady service shouldn't be throttled at its normal level | Only matters when peak and average are close; MemoryHigh is then a little higher. |
| `MemoryCurrent` is the unit's `memory.current` | Our reading | systemd lists the property without describing it | If it counted less than `memory.current`, the values would be too small. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes expected usage |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes `MemoryHigh` |
| MemoryMax ratio | 1.25 × MemoryHigh | 1–2× | Our default, [assumption 1](https://memorylimit.dev/systemd/how-it-works/index.md#all-assumptions-in-one-place); guides outside the official documentation suggest 1.25–1.43 |

## References

- [systemd.resource-control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html) ([source](https://github.com/systemd/systemd/blob/main/man/systemd.resource-control.xml)) — `MemoryHigh=`, `MemoryMax=`, units, and the deprecated `MemoryLimit=`.
- [systemd NEWS](https://github.com/systemd/systemd/blob/main/NEWS) — cgroup v1 removed in systemd 258.
- [systemd.unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html) — drop-in directories.
- [systemctl](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html) — `set-property` and `show -P`.
- [cgroup2 memory controller](https://facebookmicrosites.github.io/cgroup2/docs/memory-controller.html) (Meta, the controller's authors) — memory.high as the main control, memory.max as the safety net.
- [Control Group v2](https://docs.kernel.org/admin-guide/cgroup-v2.html) (kernel) — `memory.current`, `memory.high`, `memory.max`.
- [cAdvisor source](https://github.com/google/cadvisor/blob/master/lib/metrics/prometheus.go) — the `id` label.

[← Back to the systemd calculator](https://memorylimit.dev/systemd/index.md)
