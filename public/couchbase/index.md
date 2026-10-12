# Couchbase Memory Quota Calculator

Canonical: [Couchbase Memory Quota Calculator](https://memorylimit.dev/couchbase/)

Locale: en

Purpose: Size Couchbase service and bucket memory quotas from document count, size, replicas and working set, with ready-to-run couchbase-cli commands.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/datastores.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Couchbase doesn't have one memory limit: each service (Data, Index, Search, Eventing, Analytics) has its own quota per node, and every bucket gets a quota carved out of the Data service's. This calculator sizes each bucket from its document count, size, replicas and how much of it should stay in RAM, then works out the Data quota per node and checks that all the quotas fit in the node's memory.

## Buckets

Paste box: Prometheus metrics or Couchbase REST output.

**Where do I get these?**

Each paste fills in what it contains, so paste more than one in turn. Buckets and document counts, from the bucket API (also gives replicas, eviction policy and the current quota):

```
curl -s -u Administrator:"$CB_PASSWORD" http://localhost:8091/pools/default/buckets
```

Nodes, node RAM and the service quotas, from the cluster API:

```
curl -s -u Administrator:"$CB_PASSWORD" http://localhost:8091/pools/default
```

Or document counts as Prometheus metrics, from every Data node's `/metrics` endpoint — each node counts only its own active items, so paste them all and they're added up — or from a Prometheus `kv_curr_items` query, as text or API JSON:

```
curl -s -u Administrator:"$CB_PASSWORD" http://localhost:8091/metrics | grep -E '^kv_(curr_items|ep_cache_size)'
```

Document and key sizes aren't in any of them; average a sample of your documents.

One block per bucket. Document and key sizes are averages; get them from a sample of real documents.

## Cluster layout

- **Data nodes**
- **RAM per node** (GiB)

## Other services

Quota per node, in MiB, for each service running on those nodes. These aren't calculated: each is added as entered to the node's total. Leave 0 for a service that isn't deployed; one that runs needs at least 256 MiB (Analytics 1024 MiB).

- **Index quota** (MiB)
- **Search quota** (MiB)
- **Eventing quota** (MiB)
- **Analytics quota** (MiB)

**Advanced: sizing defaults and thresholds**

Values the result relies on that are Couchbase’s sizing defaults, or our own thresholds for the warnings. Each “?” says how one moves the result; the guide says where it comes from.

- **Metadata per document** (bytes)
- **Overhead** (%)
- **High-water mark** (%)
- **Storage engine**: Couchstore; Magma
- **Small node below** (GiB)
- **Full-ejection warning below** (%)

## Service and bucket quotas in short

Couchbase doesn't have one memory limit. It has two levels of quota, nested inside the node's RAM: a quota per service on each node (Data, Index, Search, Eventing, Analytics; Query has none and uses whatever the operating system has left), and a quota per bucket, taken out of the Data service's. All bucket quotas together must fit in the Data quota. [Couchbase docs](https://docs.couchbase.com/server/current/learn/buckets-memory-and-storage/memory.html)

This calculator doesn't use the average-and-peak model of the other pages. It applies Couchbase's own Data service sizing formula to each bucket from its document count, size, replicas and working set, spreads the result over the Data nodes, and checks that all the quotas fit in the node's RAM. The overhead, metadata size and high-water mark can be changed under *Advanced*. [Couchbase docs](https://docs.couchbase.com/server/current/install/sizing-general.html)

The formula is written for the Couchstore storage engine, so the calculator assumes buckets use it; Magma buckets can run with much less memory.

**Common input mistakes**

- Guessing document and key sizes: nothing in the metrics or REST APIs gives them reliably, so average a sample of real documents.
- Leaving out replicas: every replica is a full extra copy of the bucket's data and metadata, held in the same quota.
- Forgetting the other services: Index, Search, Eventing and Analytics quotas are added as entered to the node's total.

Full derivation, warnings and every assumption: [how the Couchbase calculator works](https://memorylimit.dev/couchbase/how-it-works/index.md).

## What you get

- couchbase-cli
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/couchbase/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Couchbase%20memory%20quotas&title=%5BBug%5D%20Couchbase%20memory%20quotas%3A%20).
