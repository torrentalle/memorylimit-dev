# Redis maxmemory Calculator

Canonical: [Redis maxmemory Calculator](https://memorylimit.dev/redis/)

Locale: en

Purpose: Size Redis maxmemory from observed used_memory, with an eviction policy and the host or container memory Redis needs around it for fragmentation, persistence.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/datastores.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

`maxmemory` caps how much data Redis keeps before it starts evicting keys — for a cache, it's the setting that trades hit rate against memory cost. The Redis process needs more than `maxmemory`, though: fragmentation, client buffers and the fork used for snapshots all sit on top of it. This calculator sizes `maxmemory` from observed usage and tells you how much memory to give the host or container.

## Usage data

Paste box: used_memory samples.

**Where do I get these numbers?**

With redis_exporter, use a **range** query over a representative period (a week is a good default):

```
redis_memory_used_bytes{instance="redis:6379"}
```

Or sample Redis directly and paste the lines:

```
while sleep 60; do redis-cli INFO memory | grep '^used_memory:'; done
```

Enter observed `used_memory` directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **Eviction sensitivity**: Low — occasional evictions are fine; Medium; High — avoid evictions at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Request margin** (%)
- **Limit margin** (%)
- **Provisioning factor** (× maxmemory)

## maxmemory and provisioning in short

`maxmemory` is the most memory Redis uses for data; past it Redis applies the eviction policy. `allkeys-lru` evicts the least recently used keys, while `noeviction` returns errors for writes at the limit. Buffers for replication and the AOF don't count towards `maxmemory`, so Redis can use somewhat more. [Redis docs](https://redis.io/docs/latest/develop/reference/eviction/)

The calculator sizes `maxmemory` from the **peak** `used_memory` plus a margin, with a floor from the average. The margins are MemoryLimit's own defaults, changeable under *Advanced*. It writes `allkeys-lru`, taking this Redis to be a cache.

It also tells you how much memory to give the process: in a write-heavy application Redis can use up to twice its normal memory while it saves an RDB file or rewrites the AOF, so the calculator provisions 2 × `maxmemory`. Without persistence or replication it suggests about 1.25 ×. [Redis docs](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/)

**Common input mistakes**

- Using `allkeys-lru` for data you can't lose: use `noeviction`, so writes fail at the limit instead.
- Provisioning only `maxmemory`: in a write-heavy application the process can need up to twice that while it saves an RDB file or rewrites the AOF.
- Setting `maxmemory` equal to the memory you have: Redis advises setting it below the free memory, to leave room for its overhead and fragmentation.

Full derivation, warnings and every assumption: [how the Redis calculator works](https://memorylimit.dev/redis/how-it-works/index.md). The shared formula and margin tables: [the sizing model](https://memorylimit.dev/sizing-model/index.md).

## What you get

- redis.conf
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/redis/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Redis%20maxmemory&title=%5BBug%5D%20Redis%20maxmemory%3A%20).
