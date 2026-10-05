# How the Azure Functions calculator works

Canonical: [How the Azure Functions calculator works](https://memorylimit.dev/azure-functions/how-it-works/)

Locale: en

Purpose: How the Azure Functions calculator picks a Flex Consumption instance size or Premium SKU: the sizes and their CPU, Microsoft's 2,048 MB default, concurrency, and what to paste, with links to the Azure docs.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Azure Functions memory calculator](https://memorylimit.dev/azure-functions/index.md)

This page walks through how the [Azure Functions calculator](https://memorylimit.dev/azure-functions/index.md) turns your usage data into an instance size. It starts from the peak side of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by Microsoft's documentation end with an Azure docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## Fixed instance sizes

Azure Functions doesn't take a free-form memory value. Flex Consumption, the recommended serverless plan, offers three instance sizes: [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)

| Instance memory | CPU cores | Default HTTP concurrency |
| --- | --- | --- |
| 512 MB | 0.25 | 4 |
| 2,048 MB | 1 | 16 |
| 4,096 MB | 2 | 32 |

Python apps default to an HTTP concurrency of 1 at every size. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/functions-concurrency) Each instance also gets 272 MB the platform keeps for system and host processes, which isn't billed. Your function code and the Functions host share the instance's resources. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)

## From peak usage to an instance size

```
memory = peak × (1 + limit margin)
size   = the smallest Flex Consumption size ≥ max(memory, 2,048 MB), else the smallest Elastic Premium SKU ≥ memory
```

Running out of memory recycles the instance, so, as with Lambda and Cloud Run, only the peak sets the size. The limit margin comes from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains it.

Microsoft writes the sizes in MB but measures memory in MB and MiB interchangeably, so the calculator compares MiB with those MB as equal; the sizes being powers of two point the same way. [Assumption](https://memorylimit.dev/azure-functions/how-it-works/index.md#all-assumptions-in-one-place)

### Worked example

Peak 630 MiB, generic workload, medium sensitivity, production:

| memory | 630 MiB × 1.30 | 819 MiB |
| --- | --- | --- |
| instance size | 512 is too small; 2,048 fits | 2048 MB |
| CPU | for that size | 1 core |

A small function peaking at 50 MiB would fit 512 MB, but gets Microsoft's 2,048 MB default:

| instance size | 50 MiB × 1.20 = 60 MiB; at least 2,048 MB | 2048 MB |
| --- | --- | --- |
| CPU | for that size | 1 core |

## Microsoft's guidance: 2,048 MB and concurrency

Microsoft suggests 2,048 MB as the default for most apps, and 512 MB or 4,096 MB when concurrency or processing power call for it. Larger instances handle more concurrent executions, and CPU and network bandwidth grow with the size. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)

So the calculator never goes below 2,048 MB: it picks the smallest size the measured peak fits in, from 2,048 MB up. 512 MB stays a choice you make by hand for a small, low-concurrency app, which then gets 0.25 cores and a default HTTP concurrency of 4; the note under the result says so. [Assumption](https://memorylimit.dev/azure-functions/how-it-works/index.md#all-assumptions-in-one-place)

Executions on an instance share its memory, so the measured peak includes the concurrency the app ran at. Raising concurrency, or moving to a size with a higher default, can need more memory per instance. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/functions-concurrency) [Assumption](https://memorylimit.dev/azure-functions/how-it-works/index.md#all-assumptions-in-one-place)

## Above 4,096 MB: Elastic Premium

| SKU | Cores | Memory |
| --- | --- | --- |
| EP1 | 1 | 3.5 GB |
| EP2 | 2 | 7 GB |
| EP3 | 4 | 14 GB |

Premium bills for the cores and memory provisioned, keeps at least one instance running, and every function app in the plan shares its instances. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/functions-premium-plan) EP1 never comes up, because Flex Consumption's 4,096 MB already covers it, and the calculator assumes your app is the only one on the plan. [Assumption](https://memorylimit.dev/azure-functions/how-it-works/index.md#all-assumptions-in-one-place)

| memory | 5000 MiB × 1.30 | 6500 MiB |
| --- | --- | --- |
| instance size | above 4,096 MB; EP2 holds 7,168 MiB | EP2 |
| CPU | for that SKU | 2 cores |

The legacy Consumption plan runs every instance with up to 1.5 GB and has nothing to size. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale)

## What the calculator writes

```
az functionapp scale config set --resource-group <resource-group> --name <app> --instance-memory 2048

functionAppConfig: {
  scaleAndConcurrency: {
    instanceMemoryMB: 2048
  }
}
```

- `az functionapp scale config set --instance-memory` changes a Flex Consumption app's size at any time. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-how-to)
- In Bicep or ARM, `functionAppConfig.scaleAndConcurrency.instanceMemoryMB` sets the memory of each instance. [Azure docs](https://learn.microsoft.com/en-us/azure/templates/microsoft.web/sites)
- For Premium, `az functionapp plan update --sku EP2` changes the plan's SKU. [Azure docs](https://learn.microsoft.com/en-us/cli/azure/functionapp/plan)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Too big for Flex Consumption warning | The memory is above 4,096 MB | Flex Consumption's largest size. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan) |
| Above every Premium SKU warning | The memory is above EP3's 14 GB | Premium's largest SKU. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/functions-premium-plan) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## Where the numbers come from

Azure Monitor's **Memory working set** (`MemoryWorkingSet`) is the memory the app uses now, and **Average memory working set** its average; both can be split by instance. They aren't available for Linux apps on the legacy Consumption plan. [Azure docs](https://learn.microsoft.com/en-us/azure/azure-functions/monitor-functions-reference) Take the highest per-instance working set over a representative period as the peak.

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Azure's MB are MiB | Our reading | The docs use MB and MiB for the same metrics; the sizes are powers of two | If they were decimal, a peak just under a size would be about 5% too big for it. |
| Never below Microsoft's 2,048 MB default | Our default | Microsoft suggests it for most apps; 512 MB brings less CPU and concurrency | A small, low-concurrency app could run on 512 MB for less; set it by hand. |
| Concurrency stays as when the samples were taken | About your setup | Executions on an instance share its memory | More concurrent executions per instance need more memory; size again after changing it. |
| The app is alone on its Premium plan | About your setup | Apps in a Premium plan share its instances | Add up the peaks of every app in the plan before choosing a SKU. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the memory the instance size must fit |
| Minimum instance size | 2,048 MB | 512, 2,048 or 4,096 MB | Microsoft’s suggestion for most apps, [assumption 2](https://memorylimit.dev/azure-functions/how-it-works/index.md#all-assumptions-in-one-place); 512 MB suits a small, low-concurrency app |

## References

- [Flex Consumption plan](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan) — instance sizes, cores, the 272 MB buffer and Microsoft's default.
- [Concurrency in Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-concurrency) — default HTTP concurrency per size.
- [Premium plan](https://learn.microsoft.com/en-us/azure/azure-functions/functions-premium-plan) — EP1–EP3 and billing.
- [Scale and hosting](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale) — memory limits per plan, Consumption's 1.5 GB.
- [Manage Flex Consumption apps](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-how-to) — `az functionapp scale config set --instance-memory`.
- [Microsoft.Web/sites template reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.web/sites) — `instanceMemoryMB`.
- [`az functionapp plan`](https://learn.microsoft.com/en-us/cli/azure/functionapp/plan) — `update --sku`.
- [Monitoring data reference](https://learn.microsoft.com/en-us/azure/azure-functions/monitor-functions-reference) — `MemoryWorkingSet` and `AverageMemoryWorkingSet`.

[← Back to the Azure Functions calculator](https://memorylimit.dev/azure-functions/index.md)
