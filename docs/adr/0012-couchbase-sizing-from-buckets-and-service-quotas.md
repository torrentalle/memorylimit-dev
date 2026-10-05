# 12. Couchbase: size quotas from buckets and services, with its own page script

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Every other platform answers "how much memory, with how much headroom" from an observed average and peak
([ADR 0003](0003-sizing-model-average-for-request-peak-for-limit.md)). Couchbase doesn't fit that shape:

- **There is no single limit.** The Data, Index, Search, Eventing and Analytics services each have a quota per
  node. The Query service has none. The quotas have to fit in the node's RAM together, next to the OS.
- **Bucket quotas are a second level.** Each bucket gets a cluster-wide quota carved out of the Data service's,
  so the bucket quotas must add up to at most Data quota × Data nodes.
- **The Data quota comes from the dataset**, not from usage samples: document count and size, replicas, how much
  of the data should stay resident, and whether metadata can be evicted. Couchbase publishes a sizing formula
  for this.

The shared calculator page (`app.js`) has exactly one input pair, and `tests/pages.test.js` requires every
calculator page to contain every element id `app.js` reads.

## Decision

- **Model:** per bucket, quota = (resident metadata + working set) × 1.25 overhead ÷ 0.85 high-water mark,
  rounded up to a whole MiB, with a 100 MiB floor. Data quota per node = bucket total ÷ Data nodes. Index, Search,
  Eventing and Analytics quotas are entered by the user in MiB; estimating them from index definitions is left
  for later. The result warns when the quotas pass Couchbase's recommended share of node RAM (90%, or 80% on nodes
  under 5 GiB, where its firm limit is 80% too) and is an error above the firm limit, max(RAM − 1 GiB, 80% × RAM).
  It also warns when a bucket quota is under 10% of the bucket's dataset (Couchbase's Couchstore guidance).
  The formula and its constants (56 bytes of metadata per document, 25% overhead, 85% high-water mark) are
  Couchbase's, with no user-selectable headroom: the guide gives one overhead figure, so offering others would
  suggest a choice it doesn't back. Quotas round up only to a whole MiB, the unit Couchbase takes. With full
  ejection Couchbase evicts a document's key and metadata along with its value, so only the resident documents'
  metadata is counted. That follows from the documented behaviour, but the sizing formula has no case for it. A
  full-ejection bucket with under 20% in RAM (our threshold) gets a latency warning.
- **Formatter:** `formatters/couchbase.js` keeps the pure math (`calculateSizing()`) and the output (`format()`)
  in one module and returns the same result shape as the other formatters, minus gauge markers. It takes the
  Couchbase input instead of `calculateRawSizing()`'s output, because the sizing core's average/peak model
  doesn't apply.
- **Page script:** a platform definition may set `entry` in `platforms.js`. Couchbase sets it to
  `couchbase-page.js`, which owns the bucket list and reuses the same result markup and CSS classes.
  `entryUrl()` returns the shared `calculator-page.js` for everyone else. `tests/pages.test.js` checks each
  page against the ids and the script its own entry needs.
- **Paste mode:** `couchbase-parser.js` detects and reads Prometheus exposition text, Prometheus API JSON and
  Couchbase REST JSON (`/pools/default/buckets`, `/pools/default`). Prometheus supplies document counts
  (`kv_curr_items`, peak per series, summed over nodes) and each paste fills in only what it contains, so
  buckets and cluster info can be pasted one after the other. Document and key sizes are never guessed. The
  mode toggle follows the other calculators: Manual values first and the default, the form visible in both.
- **Method page:** the result's "How this was derived" block stays a short summary with the actual numbers.
  The full method, every constant's source in Couchbase's documentation, and every assumption are on
  `/couchbase/how-it-works/`, linked from that block and opened in a new tab so the result isn't lost. A platform
  definition's `guide` field registers such a page for `sync:pages` and the sitemap.
- **Shared code:** the clipboard helper moved out of `app.js` into `clipboard.js` so both entry points use it.

## Alternatives considered

- **Force the dataset into average/peak.** Keeps one page script, but the numbers would mean something
  different from every other platform, and the per-bucket and per-service structure would be lost.
- **Make `app.js` handle both input shapes.** One entry point, but every platform's page would carry code for a
  form it doesn't have, and the required-ids test would stop meaning anything.
- **Index quota estimated automatically.** It depends on index definitions and document shape, which we can't
  read from a handful of form fields. A wrong estimate would look authoritative.

## Consequences

- Couchbase is the one platform with its own page script. A later platform with a non-usage-based model (for
  example Elasticsearch heap) can use `entry` the same way.
- The result is only as good as the average sizes entered and the chosen working set. The note says so, and
  that minimums and defaults differ between Couchbase Server versions.
- Value ejection is the default and keeps all metadata resident; full ejection only counts the working-set
  share of it, giving smaller quotas but more disk reads. Magma-specific memory behaviour isn't modelled.

## Update

Bucket quotas are per node, not cluster-wide: Couchbase's `ramQuota` and `bucket-edit --bucket-ramsize` are MiB
per node, and every bucket's quota comes out of the Data quota on each Data node. A bucket's quota is now its
cluster-wide need ÷ Data nodes, rounded up to a whole MiB with the 100 MiB floor per node, and the Data quota per
node is the bucket quotas added up (at least 256 MiB). The 10% dataset check compares the bucket's quota on all
Data nodes together with its dataset. Paste mode reads the current quota per node (`quota.rawRAM`, and
`kv_ep_cache_size` from one node rather than summed). The text above describes the original model.
