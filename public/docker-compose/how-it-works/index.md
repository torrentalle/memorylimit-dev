# How the Docker Compose calculator works

Canonical: [How the Docker Compose calculator works](https://memorylimit.dev/docker-compose/how-it-works/)

Locale: en

Purpose: How the Docker Compose calculator sets deploy.resources memory limits and reservations: rounding, the reservation rule, swap and warnings, with docs links.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← Docker Compose memory limits calculator](https://memorylimit.dev/docker-compose/index.md)

This page walks through how the [Docker Compose calculator](https://memorylimit.dev/docker-compose/index.md) turns your usage data into a service's memory limit and reservation. Both start from the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by Docker's documentation or source code end with a Docker docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to the table of all of them.

## What the two settings do

The Compose file sets both under `deploy.resources`: the platform must stop the container from allocating more than the limit, and must guarantee it can allocate at least the reservation. [Docker docs](https://docs.docker.com/reference/compose-file/deploy/)

- **The limit** becomes the container's hard memory limit (`--memory`). `docker compose up` applies it, and it takes precedence over a service-level `mem_limit`. [Docker source](https://github.com/docker/compose/blob/main/pkg/compose/create.go)
- **The reservation** becomes `--memory-reservation`: a soft limit, lower than the limit, that Docker enforces only when it detects contention or low memory on the host. [Docker docs](https://docs.docker.com/engine/containers/resource_constraints/)
- **In Swarm**, a service is only placed on a node with that much memory available to reserve, and a node's reservations can't add up to more than its memory. [Docker docs](https://docs.docker.com/reference/cli/docker/service/create/)

Docker's own advice is to test your application's memory needs before production; it publishes no formula. [Docker docs](https://docs.docker.com/engine/containers/resource_constraints/) That's what the average and peak you enter stand for.

## Reservation and limit

```
reservation = average × (1 + request margin)                   rounded up to a whole M
limit       = max(peak × (1 + limit margin), reservation, 6M)   rounded up to a whole M
```

The margins come from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains them, and they are assumptions too.

Docker rejects a container whose memory limit is below its reservation, or below 6 MiB. So when the peak is so close to the average that the peak-based limit falls below the reservation, the limit is raised to the reservation. [Docker source](https://github.com/moby/moby/blob/master/daemon/daemon_unix.go)

### Worked example

Average 410 MiB, peak 630 MiB, generic workload, medium sensitivity, production, 3 replicas:

| reservation | 410 MiB × 1.30 = 533 MiB | 533M |
| --- | --- | --- |
| limit | 630 MiB × 1.30 = 819 MiB, above the reservation | 819M |
| total reservation | 533M × 3 replicas | 1599M |

A cache averaging 1000 MiB with a 1020 MiB peak, medium sensitivity, where the reservation decides the limit:

| reservation | 1000 MiB × 1.35 = 1350 MiB | 1350M |
| --- | --- | --- |
| limit | 1020 MiB × 1.30 = 1326 MiB, below the reservation | 1350M |

## What the calculator writes

```
deploy:
  resources:
    limits:
      memory: 819M
    reservations:
      memory: 533M
```

- Memory is a byte value with a unit: `b`, `k`, `m` or `g`, with an optional `b`. [Docker docs](https://docs.docker.com/reference/compose-file/extension/) Compose reads it with Docker's RAM parser, which ignores case and counts in powers of 1024, so `819M` is 819 MiB. [Docker source](https://github.com/docker/go-units/blob/master/size.go)
- The same values can go at service level, as `mem_limit` and `mem_reservation`. If both forms are set, they must agree. [Docker docs](https://docs.docker.com/reference/compose-file/services/)

## Swap

If the host has swap and `memswap_limit` isn't set, a container with a memory limit can use as much swap as that limit, so a 819M limit allows 1638M in total. Setting `memswap_limit` equal to the limit prevents any swap. [Docker docs](https://docs.docker.com/engine/containers/resource_constraints/)

The calculator leaves swap as Docker sets it: whether a service should swap or fail fast depends on the service, and the note under the result points it out. [Assumption](https://memorylimit.dev/docker-compose/how-it-works/index.md#all-assumptions-in-one-place)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Limit raised to the reservation warning | The peak-based limit came out below the reservation | Docker rejects a limit below the reservation. [Docker source](https://github.com/moby/moby/blob/master/daemon/daemon_unix.go) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
container_memory_working_set_bytes{name=~"myproject-api-[0-9]+"}
```

- This is cAdvisor's working set metric, a gauge in bytes. [cAdvisor docs](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md) Its `name` label is the container's name. [cAdvisor source](https://github.com/google/cadvisor/blob/master/lib/metrics/prometheus.go)
- Compose names a service's containers `<project>-<service>-<number>`, so the regex above matches every replica of the `api` service in the `myproject` project. [Docker source](https://github.com/docker/compose/blob/main/pkg/compose/service_containers.go) A service with its own `container_name` needs that name instead. [Assumption](https://memorylimit.dev/docker-compose/how-it-works/index.md#all-assumptions-in-one-place)
- The working set leaves out file cache the kernel can reclaim, so it's closer to what the container really needs than total usage. [Assumption](https://memorylimit.dev/docker-compose/how-it-works/index.md#all-assumptions-in-one-place) A range query over a representative period (a week is a good default) gives the best average and peak.

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Swap is left as Docker sets it | Our default | Whether to swap or fail fast depends on the service | On a host with swap, the container can use up to its limit again in swap; set `memswap_limit` to the limit to prevent it. |
| Containers keep Compose's default names | About your setup | The paste hint filters by `<project>-<service>-<number>` | With `container_name` set, the query matches nothing; filter by that name. |
| Size from the working set, not total usage | Our default | Total usage includes reclaimable file cache | Sizing from total usage gives larger values for services that read many files. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Request margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the reservation |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes the limit |

## References

- [Compose Deploy Specification](https://docs.docker.com/reference/compose-file/deploy/) — `resources.limits` and `resources.reservations`.
- [Compose services](https://docs.docker.com/reference/compose-file/services/) — `mem_limit`, `mem_reservation`, `memswap_limit`.
- [Compose file reference](https://docs.docker.com/reference/compose-file/extension/) — byte value units.
- [Resource constraints](https://docs.docker.com/engine/containers/resource_constraints/) — `--memory`, `--memory-reservation`, swap, and testing before production.
- [`docker service create`](https://docs.docker.com/reference/cli/docker/service/create/) — how Swarm schedules by reservation.
- [Compose source: create.go](https://github.com/docker/compose/blob/main/pkg/compose/create.go) — how `deploy.resources` and `mem_limit` become container settings.
- [Docker Engine source: daemon_unix.go](https://github.com/moby/moby/blob/master/daemon/daemon_unix.go) — the 6 MiB minimum and limit ≥ reservation.
- [go-units: size.go](https://github.com/docker/go-units/blob/master/size.go) — how memory values are parsed.
- [cAdvisor Prometheus metrics](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md) — `container_memory_working_set_bytes`.

[← Back to the Docker Compose calculator](https://memorylimit.dev/docker-compose/index.md)
