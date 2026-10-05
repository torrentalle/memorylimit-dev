# Docker Compose Memory Limits Calculator

Canonical: [Docker Compose Memory Limits Calculator](https://memorylimit.dev/docker-compose/)

Locale: en

Purpose: Right-size Docker Compose container memory reservations and limits from observed usage. Generates a deploy.resources snippet plus the legacy mem_limit equivalent.

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/containers.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Docker Compose's `deploy.resources` block controls how much memory a service reserves and how much it's allowed to use before it gets killed. This calculator sizes both values — plus the service-level `mem_limit` / `mem_reservation` equivalent — from your service's observed average and peak memory usage.

## Usage data

Paste box: Raw query output / scrape.

**Which query should I paste?**

Use a **range** query over a representative period (a week is a good default) for one service. Every sample is averaged, and the highest becomes the peak — an instant query only gives one value per container.

```
container_memory_working_set_bytes{name=~"myproject-api-[0-9]+"}
```

Compose names containers `<project>-<service>-<number>`, so this matches every replica of one service.

Paste the Prometheus UI table output, the HTTP API JSON, a Grafana CSV export, or a list of values with units (`412 MiB`).

Enter observed usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **Replica count**
- **OOMKill sensitivity**: Low — tolerate occasional OOMKills; Medium; High — avoid OOMKills at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Request margin** (%)
- **Limit margin** (%)

## What you get

- docker-compose.yml
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/docker-compose/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new?template=bug.yml&platform=Docker%20Compose&title=%5BBug%5D%20Docker%20Compose%3A%20).
