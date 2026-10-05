# How the Redis calculator works

Canonical: [How the Redis calculator works](https://memorylimit.dev/redis/how-it-works/)

Locale: en

Purpose: How the Redis calculator sets maxmemory and the memory to provision: the eviction policy, the 2× fork overhead, units and CONFIG SET, with docs links.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Redis maxmemory calculator](https://memorylimit.dev/redis/index.md)

This page walks through how the [Redis calculator](https://memorylimit.dev/redis/index.md) turns your `used_memory` into `maxmemory` and the memory to give the Redis process. It starts from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by the Redis documentation end with a Redis docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## maxmemory and the eviction policy

- `maxmemory` is the most memory Redis uses for data; past it Redis applies the eviction policy. 0 means no limit, the default on 64-bit systems. [Redis docs](https://redis.io/docs/latest/develop/reference/eviction/)
- `allkeys-lru` evicts the least recently used keys, and Redis calls it a good default when you have no reason to prefer another. `noeviction` instead returns errors for writes at the limit. [Redis docs](https://redis.io/docs/latest/develop/reference/eviction/) The calculator writes `allkeys-lru`, taking this Redis to be a cache. [Assumption](https://memorylimit.dev/redis/how-it-works/index.md#all-assumptions-in-one-place)
- Buffers for replication and the AOF don't count towards `maxmemory`, so Redis can use somewhat more. [Redis docs](https://redis.io/docs/latest/develop/reference/eviction/)

## From used_memory to maxmemory

```
maxmemory           = max(peak × (1 + limit margin), average × (1 + request margin))   rounded up to a whole mb
memory to provision = 2 × maxmemory
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too. In Redis's configuration, `mb` is 1024 × 1024 bytes, so MiB pass through unconverted. [Redis docs](https://github.com/redis/redis/blob/unstable/redis.conf)

The samples are `used_memory`, which includes Redis's own overhead and not only the data, so a `maxmemory` sized from them is on the generous side. [Assumption](https://memorylimit.dev/redis/how-it-works/index.md#all-assumptions-in-one-place)

### Worked example

A cache peaking at 630 MiB of `used_memory`, medium sensitivity, production:

| maxmemory | 630 MiB × 1.30 = 819 MiB | 819mb |
| --- | --- | --- |
| memory to provision | 2 × 819 | 1638 MiB |

A steady cache, averaging 1000 MiB with a 1010 MiB peak at high sensitivity, where the average decides:

| maxmemory | 1000 MiB × 1.55 = 1550 MiB, above 1010 × 1.40 = 1414 | 1550mb |
| --- | --- | --- |
| memory to provision | 2 × 1550 | 3100 MiB |

## Memory for the process

- In a write-heavy application, Redis can use up to twice its normal memory while it saves an RDB file or rewrites the AOF, because the forked child shares pages that writes then copy. [Redis docs](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/)
- With replication, Redis makes RDB saves even with persistence off, unless replication is diskless. [Redis docs](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/)
- Redis also advises setting `maxmemory` below the free memory, to leave room for its overhead and fragmentation: with 10 GB free, set it to 8 or 9 GB. [Redis docs](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/)

So the calculator provisions the worst case, 2 × `maxmemory`. [Assumption](https://memorylimit.dev/redis/how-it-works/index.md#all-assumptions-in-one-place) Without persistence or replication, the note suggests about 1.25 × `maxmemory`, which is Redis's 10-to-8 ratio turned around. [Assumption](https://memorylimit.dev/redis/how-it-works/index.md#all-assumptions-in-one-place)

## What the calculator writes

```
maxmemory 819mb
maxmemory-policy allkeys-lru
```

- Both lines go in `redis.conf`, or at runtime with `CONFIG SET maxmemory 819mb`, as the eviction guide shows. [Redis docs](https://redis.io/docs/latest/develop/reference/eviction/)
- `CONFIG SET` takes effect from the next command, and `CONFIG REWRITE` writes the running configuration back to the `redis.conf` the server started with. [Redis docs](https://redis.io/docs/latest/commands/config-rewrite/)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
redis_memory_used_bytes{instance="redis:6379"}
```

- redis_exporter publishes `INFO`'s `used_memory` as `redis_memory_used_bytes`. [redis_exporter source](https://github.com/oliver006/redis_exporter/blob/master/exporter/exporter.go)
- Without it, sample `redis-cli INFO memory` and paste the `used_memory:` lines; the calculator reads them as bytes.

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Provision 2 × maxmemory | Our default | Redis documents up to 2× during RDB saves and AOF rewrites | A read-mostly Redis copies fewer pages during a fork and needs less. |
| About 1.25 × maxmemory without persistence or replication | Our reading | Redis's example sets maxmemory to 8 of 10 GB free | With 9 of 10 GB, the ratio is 1.11; more fragmentation needs more. |
| maxmemory from peak `used_memory` | Our default | `used_memory` is the figure INFO and exporters give | It includes overhead beyond the data, so maxmemory comes out a little high. |
| This Redis is a cache | About your setup | That's what an eviction policy is for | For data you can't lose, use `noeviction` so writes fail at the limit instead. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the floor of `maxmemory` |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes `maxmemory` |
| Provisioning factor | 2 × maxmemory | 1–3× | Redis documents up to 2× during RDB saves and AOF rewrites, [assumption 1](https://memorylimit.dev/redis/how-it-works/index.md#all-assumptions-in-one-place); about 1.25× without persistence or replication, [assumption 2](https://memorylimit.dev/redis/how-it-works/index.md#all-assumptions-in-one-place) |

## References

- [Key eviction](https://redis.io/docs/latest/develop/reference/eviction/) — `maxmemory`, the policies, and buffers not counted.
- [Redis administration](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/) — up to 2× during saves, setting `maxmemory` below free memory, replication.
- [redis.conf](https://github.com/redis/redis/blob/unstable/redis.conf) — memory units.
- [`CONFIG SET`](https://redis.io/docs/latest/commands/config-set/) and [`CONFIG REWRITE`](https://redis.io/docs/latest/commands/config-rewrite/).
- [redis_exporter source](https://github.com/oliver006/redis_exporter/blob/master/exporter/exporter.go) — `redis_memory_used_bytes`.

[← Back to the Redis calculator](https://memorylimit.dev/redis/index.md)
