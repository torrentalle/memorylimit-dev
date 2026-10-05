# How the Couchbase calculator works

Canonical: [How the Couchbase calculator works](https://memorylimit.dev/couchbase/how-it-works/)

Locale: en

Purpose: The formula, constants and checks behind the Couchbase memory quota calculator, step by step, with every assumption spelled out and links to the Couchbase docs.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Couchbase memory quota calculator](https://memorylimit.dev/couchbase/index.md)

This page walks through every number the [Couchbase calculator](https://memorylimit.dev/couchbase/index.md) produces: the formula, where each constant comes from, the checks behind each warning, and the commands it writes. Statements backed by Couchbase's documentation end with a Couchbase docs link to the page that says so. Where the calculator has to fill a gap the documentation leaves, the choice is explained and marked Assumption, which links to the table of all of them.

## Two levels of quota

Couchbase doesn't have one memory limit. It has two levels of quota, nested inside the node's RAM ([Memory](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html)):

- **Service quotas, per node.** The Data, Index, Search, Eventing and Analytics services each get a quota that applies on every node running that service. The Query service has no quota: it uses whatever memory the operating system has left.
- **Bucket quotas, also per node.** Each bucket gets a quota taken out of the Data service's on every Data node, so all bucket quotas together must fit in the Data quota. Couchbase's `ramQuota` and `--bucket-ramsize` are both MiB per node. [Couchbase docs](https://docs.couchbase.com/server/current/rest-api/rest-bucket-create.html)

Node RAM

OS, file cache, Query service

Service quotas

Data quota

Bucket A

Bucket B

Index, Search, Eventing, Analytics

The calculator works from the inside out: it sizes each bucket from its data (step 1), adds them up into the Data quota (step 2), adds the other services (step 3), and checks the total against the node's RAM (step 4).

## Step 1 — each bucket's quota

The bucket quota is Couchbase's own Data service sizing formula, from the [Sizing Guidelines](https://docs.couchbase.com/server/current/install/sizing-general.html), applied to one bucket at a time [Couchbase docs](https://docs.couchbase.com/server/current/install/sizing-general.html), then spread over the Data nodes, since a bucket's quota is set per node:

```
copies    = 1 + replicas
metadata  = documents × (56 bytes + key length) × copies
dataset   = documents × document size × copies
working   = dataset × working set %
need      = (metadata + working) × (1 + 25%) ÷ 85%      the whole cluster
quota     = need ÷ Data nodes                           per node
```

| Term | Value | Where it comes from |
| --- | --- | --- |
| Metadata per document | 56 bytes | Sizing Guidelines (`metadata_per_document`). Every document's key and metadata take this much plus the key itself. [Couchbase docs](https://docs.couchbase.com/server/current/install/sizing-general.html) |
| Overhead | 25% | Sizing Guidelines (`overhead_percentage`): memory the bucket uses beyond the metadata and working set the formula counts. The guide gives one figure; you can change it, and the other two, under [Values you can change](https://memorylimit.dev/couchbase/how-it-works/index.md#values-you-can-change). [Couchbase docs](https://docs.couchbase.com/server/current/install/sizing-general.html) |
| High-water mark | 85% | Sizing Guidelines and [Memory](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html): once a bucket's memory use reaches 85% of its quota, Couchbase starts ejecting items. Dividing by 0.85 keeps the working set below that line. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) |
| Replicas | 0–3 | Every replica is a full extra copy of the bucket's data and metadata, held in the same quota. `bucket-edit` accepts 0 to 3. [Couchbase docs](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-bucket-edit.html) |
| Working set % | Your input | The share of the data you want served from RAM. Higher means fewer disk reads and a bigger quota. |
| Key length, document size | Your input | Averages you supply from a sample of real documents. Nothing in the metrics or REST APIs gives them reliably, so the calculator never guesses them. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |

The formula, and the 10% minimum it's checked against, are written for the Couchstore storage engine, so the calculator assumes buckets use it. Magma buckets can run with much less memory. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place)

### Rounding

Couchbase takes quotas in whole MiB (is in mebibytes), so the result is rounded up to the next whole MiB and no further. A bucket can't have less than 100 MiB per node, so smaller results are raised to 100 MiB. [Couchbase docs](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-bucket-edit.html)

### Worked example

One bucket with 1,000,000 documents, 36-byte keys (a UUID), 1 KiB documents, 1 replica, 20% working set and value ejection, on 3 Data nodes:

| copies | 1 + 1 | 2 |
| --- | --- | --- |
| metadata | 1,000,000 × (56 + 36) B × 2 = 184,000,000 B | 175.48 MiB |
| dataset | 1,000,000 × 1,024 B × 2 = 2,048,000,000 B | 1,953.13 MiB |
| working | 1,953.13 MiB × 20% | 390.63 MiB |
| metadata + working | 175.48 + 390.63 | 566.10 MiB |
| × (1 + 25%) | 566.10 × 1.25 | 707.63 MiB |
| ÷ 85% | 707.63 ÷ 0.85, for the whole cluster | 832.50 MiB |
| ÷ Data nodes | 832.50 ÷ 3 | 277.50 MiB |
| bucket quota | rounded up to a whole MiB, per node | 278 MiB |

Notice that metadata is almost a third of what's in RAM here, even though it's under a tenth of the data. With value ejection all of it stays in memory however small the working set is, which is why buckets with many small documents need more RAM than their size suggests.

## Step 2 — the Data quota per node

```
Data quota per node = sum of bucket quotas   (at least 256 MiB)
```

Bucket quotas and the Data quota are both per node, and every bucket's quota comes out of the Data quota on each Data node, so the Data quota is the bucket quotas added up; Couchbase refuses a bucket quota that doesn't fit. Step 1 already divided each bucket's need by the Data nodes, the way the Sizing Guidelines do it the other way round: number of nodes = cluster RAM quota required ÷ per-node RAM quota. The Data service needs at least 256 MiB. [Couchbase docs](https://docs.couchbase.com/server/current/rest-api/rest-configure-memory.html)

This assumes a bucket's data spreads evenly over the Data nodes. Couchbase distributes a bucket's vBuckets across them, so after a rebalance that holds closely; a cluster that hasn't been rebalanced may be uneven. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place)

Worked example: the one bucket's 278 MiB is the whole Data quota, **278 MiB** per node.

## Step 3 — the other services

The Index, Search, Eventing and Analytics quotas are the values you enter, not calculated. How much memory an index needs depends on the index definitions and the shape of the documents, which a few form fields can't describe; an estimate would look more authoritative than it is. 0 means the service doesn't run on these nodes. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place)

A service that runs needs at least 256 MiB (Index, Search, Eventing) or 1024 MiB (Analytics); below that the calculator shows an error. [Couchbase docs](https://docs.couchbase.com/server/current/rest-api/rest-configure-memory.html)

## Step 4 — do the quotas fit the node?

The quotas of every service on a node are added up and compared with the node's RAM, against two limits.

| Limit | Rule | Result in the calculator |
| --- | --- | --- |
| Firm limit | `max(RAM − 1 GiB, 80% × RAM)` | Error: Couchbase refuses quotas above this. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) |
| Recommended share | 90% of RAM, or 80% on nodes with little memory | Warning: it leaves too little for the OS, its file cache and the Query service. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) |

Both rules come from [Memory](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html). The documentation doesn't say what "little memory" means. The calculator uses under 5 GiB: below that, 80% of RAM is already more than RAM − 1 GiB, so the firm limit itself is 80% and the two rules agree. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place)

Worked example, on a 16 GiB node with a 512 MiB Index quota: 278 + 512 = 790 MiB, 4.8% of 16,384 MiB. The firm limit is 15,360 MiB and the recommended share 14,746 MiB, so there's no warning.

## Value ejection and full ejection

When a bucket nears its quota, Couchbase ejects documents from memory [Couchbase docs](https://docs.couchbase.com/server/current/manage/manage-buckets/change-ejection-policy.html):

- **Value ejection** (the default) removes a document's value but keeps its key and metadata in memory.
- **Full ejection** removes the whole document, key and metadata included.

The sizing formula has no separate case for full ejection. Since full ejection evicts a document's metadata together with its value, the calculator counts metadata only for the documents that stay resident: metadata × working set %, instead of all of it. That follows from the documented behaviour, but the documentation doesn't spell it out as a formula. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place)

| Same bucket, 10% working set | Metadata counted | Bucket quota |
| --- | --- | --- |
| Value ejection | 175.48 MiB (all) | 546 MiB |
| Full ejection | 17.55 MiB (10%) | 314 MiB |

The smaller quota has a cost. With full ejection, reading a document that isn't in memory, or checking whether a key exists, has to go to disk, where value ejection could answer from the metadata in RAM ([Couchbase blog: Value-Only Ejection vs. Full Ejection](https://www.couchbase.com/blog/a-tale-of-two-ejection-methods-value-only-vs-full/)). That's why the calculator warns when a full-ejection bucket keeps under 20% in RAM. Changing a bucket's ejection policy restarts the bucket, so the calculator's commands never change it.

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Quotas above the firm limit error | The node's quotas total more than max(RAM − 1 GiB, 80% × RAM) | Couchbase refuses them. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) |
| Quotas above the recommended share warning | Above 90% of RAM (80% under 5 GiB) | Couchbase's recommendation. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) The 5 GiB line is ours. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |
| Service quota below its minimum error | Index, Search or Eventing under 256 MiB, Analytics under 1024 MiB | Couchbase's minimums. [Couchbase docs](https://docs.couchbase.com/server/current/rest-api/rest-configure-memory.html) |
| Bucket raised to the minimum warning | A bucket's result is under 100 MiB per node | The `--bucket-ramsize` minimum. [Couchbase docs](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-bucket-edit.html) |
| Bucket quota under 10% of its dataset warning | The quota on all Data nodes together is less than 10% of the bucket's data, replicas included | Couchbase recommends at least 10% for Couchstore, 1% for Magma. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) Comparing against the data *with* replicas is our reading: the docs say "dataset size" without defining it. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |
| Full ejection with a small working set warning | Full ejection and a working set under 20% | The disk reads are documented behaviour; the 20% threshold is ours. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |

## What a paste fills in

Paste mode reads three kinds of output, detects which it is, and fills in only what that output contains, so you can paste one after another. Anything it can't know stays as you entered it.

| Source | Fills in | Notes |
| --- | --- | --- |
| [`GET /pools/default/buckets`](https://docs.couchbase.com/server/current/rest-api/rest-bucket-info.html) | Bucket names, document count (`basicStats.itemCount`), replicas, ejection policy; shows the current quota per node (`quota.rawRAM`) | Ephemeral and Memcached buckets are skipped: they don't use this formula. `itemCount` is read as the number of documents without replicas; the documentation shows the field but doesn't define it. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |
| [`GET /pools/default`](https://docs.couchbase.com/server/current/rest-api/rest-configure-memory.html) | Data nodes, RAM per node, Index/Search/Eventing/Analytics quotas | Data nodes are the nodes listing the `kv` service; RAM is the smallest Data node's `systemStats.mem_total`, so the result fits every node. A service no node runs gets 0. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |
| Prometheus: [`kv_curr_items`](https://docs.couchbase.com/server/current/metrics-reference/data-service-metrics.html), from a node's `/metrics` or a Prometheus query | Document count per bucket; shows the current quota per node from `kv_ep_cache_size`, the same on every node | `kv_curr_items` counts items in *active* vBuckets, so one value per node is summed. [Couchbase docs](https://docs.couchbase.com/server/current/metrics-reference/data-service-metrics.html) A node's own `/metrics` has no `instance` label, so identical lines there are read as different nodes and added up, and the feedback says how many nodes the count covers; paste every Data node's output. An aggregated query such as `sum by (bucket) (kv_curr_items)` drops the metric name and is read as the item count. For range data, each node's peak is used. Metrics don't include replicas or ejection policy. [Assumption](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place) |

## The commands

For the worked example, the calculator writes:

```
# Raising quotas: run these in order. Lowering them: run the bucket-edit lines first, since Couchbase refuses a Data quota below the bucket quotas already set.
couchbase-cli setting-cluster -c localhost:8091 -u Administrator -p "$CB_PASSWORD" \
  --cluster-ramsize 278 \
  --cluster-index-ramsize 512
couchbase-cli bucket-edit -c localhost:8091 -u Administrator -p "$CB_PASSWORD" --bucket orders --bucket-ramsize 278
```

- [`setting-cluster`](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-setting-cluster.html) sets the service quotas, in MiB. Only services that run get a flag: the CLI requires a quota for a service that's enabled. The CLI reference describes `--cluster-ramsize` as the Data quota "for future nodes", so check on a running cluster that it changed, or use the REST call below.
- [`bucket-edit`](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-bucket-edit.html) sets each bucket's quota. It only changes buckets that already exist (create new ones with `bucket-create`), and it can't lower a quota below what the bucket currently uses.
- The order matters. Couchbase refuses a Data quota below the bucket quotas already set, and a bucket quota above the Data quota. When the quotas grow, set the Data quota first; when they shrink, edit the buckets first. The calculator doesn't know the current quotas, so the first line of the snippet, a shell comment, says so.
- Bucket names follow Couchbase's rule: letters, digits, `.`, `_`, `%` and `-`, up to 100 characters. The calculator rejects any other name, so the commands, which don't quote the name, are safe to run as written.
- The same service quotas through the REST API, [`POST /pools/default`](https://docs.couchbase.com/server/current/rest-api/rest-configure-memory.html) with `memoryQuota`, `indexMemoryQuota`, `ftsMemoryQuota`, `eventingMemoryQuota` and `cbasMemoryQuota`.

The password comes from a `$CB_PASSWORD` environment variable, so it never ends up in your shell history.

## All assumptions in one place

Everything the calculator decides that Couchbase's documentation doesn't, and what changes if it's wrong for you.

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Full ejection counts only resident metadata | Our reading | Full ejection evicts metadata with the document; the formula has no case for it | Quotas for full-ejection buckets are too small. Set the policy to value ejection in the form to get the formula's upper bound. |
| Key and document sizes are the averages you enter | About your setup | No API gives them reliably | The quota scales with them; measure a real sample. |
| Index, Search, Eventing, Analytics quotas are entered, not calculated | Our default | They depend on index definitions and document shape | Size them from the services' own memory use. |
| Buckets spread evenly over the Data nodes | About your setup | vBuckets are distributed across nodes | A node holding more than its share needs a larger Data quota; rebalance first. |
| "Little memory" means under 5 GiB | Our reading | Where the firm limit itself drops to 80% | Only the warning threshold moves; the firm-limit error is exact. |
| The 10% check uses the data with replicas | Our reading | The bucket quota also holds the replicas | Only the warning moves. |
| Full ejection warns under a 20% working set | Our default | A judgment call on when disk reads dominate | Only the warning moves. |
| `itemCount` counts documents without replicas | Our reading | The documentation shows the field without defining it | If it included replicas, pasted counts would be too high and quotas oversized. |
| Peak per node for Prometheus range data; smallest Data node's RAM | Our default | Size for the worst case | Quotas are a little larger than an average would give. |
| Couchstore, not Magma | About your setup | The 10% guidance and the formula are written for it | Magma buckets can run with much less memory (1% of the dataset); this sizing is conservative for them. |

### Values you can change

The calculator’s **Advanced: sizing defaults and thresholds** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Metadata per document | 56 bytes | 0–256 bytes | Couchbase’s sizing guidelines (`metadata_per_document`) |
| Overhead | 25% | 0–100% | Couchbase’s sizing guidelines (`overhead_percentage`) |
| High-water mark | 85% | 50–99% | Couchbase’s default; use the bucket’s own if you changed it |
| Storage engine | Couchstore | Couchstore or Magma | [Assumption 10](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place); only moves the 10% (Magma: 1%) dataset warning |
| Small node below | 5 GiB | 1–64 GiB | Our reading of “little memory”, [assumption 5](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place); only moves the 90%/80% warning |
| Full-ejection warning below | 20% | 1–100% | Our threshold, [assumption 7](https://memorylimit.dev/couchbase/how-it-works/index.md#all-assumptions-in-one-place); only moves the warning |

Minimums and defaults can change between Couchbase Server versions; check yours before applying a result.

## References

- [Sizing Guidelines](https://docs.couchbase.com/server/current/install/sizing-general.html) — the Data service formula and its constants.
- [Memory](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html) — service quotas, minimums, the recommended share and firm limit, water marks, ejection, the 10%/1% dataset guidance.
- [Change the Ejection Policy](https://docs.couchbase.com/server/current/manage/manage-buckets/change-ejection-policy.html) — what each policy keeps in memory; changing it restarts the bucket.
- [Configuring Memory (REST)](https://docs.couchbase.com/server/current/rest-api/rest-configure-memory.html) — `POST /pools/default` and the quota parameters.
- [Getting Bucket Information (REST)](https://docs.couchbase.com/server/current/rest-api/rest-bucket-info.html) — `/pools/default/buckets` fields.
- [Data Service Metrics](https://docs.couchbase.com/server/current/metrics-reference/data-service-metrics.html) — `kv_curr_items`, `kv_ep_cache_size`.
- [`couchbase-cli setting-cluster`](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-setting-cluster.html) and [`couchbase-cli bucket-edit`](https://docs.couchbase.com/server/current/cli/cbcli/couchbase-cli-bucket-edit.html) — the commands and their units.
- [Value-Only Ejection vs. Full Ejection](https://www.couchbase.com/blog/a-tale-of-two-ejection-methods-value-only-vs-full/) (Couchbase blog) — the performance trade-off of full ejection.

[← Back to the Couchbase calculator](https://memorylimit.dev/couchbase/index.md)
