# Right-sized memory limits, wherever you deploy

Canonical: [Right-sized memory limits, wherever you deploy](https://memorylimit.dev/)

Locale: en

Purpose: Right-size memory limits for Kubernetes, Docker, Lambda, Redis and more from Prometheus usage data. Free, no signup, and it runs entirely in your browser.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/site.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

MemoryLimit turns observed container or function memory usage — pasted straight from a Prometheus or Grafana query, or entered by hand — into ready-to-use memory configuration for the platform you actually deploy to. The calculation runs entirely in your browser: nothing you paste or type is sent anywhere.

## Containers & orchestration

- [Kubernetes](https://memorylimit.dev/kubernetes/index.md): right-size Pod memory requests and limits from real usage data.
- [Docker Compose](https://memorylimit.dev/docker-compose/index.md): size deploy.resources memory reservations and limits for Compose services.
- [HashiCorp Nomad](https://memorylimit.dev/nomad/index.md): set a task's memory and memory_max for Nomad's memory oversubscription.

## Serverless

- [AWS Lambda](https://memorylimit.dev/lambda/index.md): find the MemorySize that balances cost per invocation against duration.
- [Google Cloud Run](https://memorylimit.dev/cloud-run/index.md): pick a Cloud Run memory limit, with the CPU it needs, from real instance usage.
- [Azure Functions](https://memorylimit.dev/azure-functions/index.md): pick the Flex Consumption instance size, or the Premium SKU, a function app needs.

## VMs & bare metal

- [Systemd / Bare Metal / VM](https://memorylimit.dev/systemd/index.md): set MemoryHigh and MemoryMax for services running directly on a Linux host.
- [VMware vSphere](https://memorylimit.dev/vmware/index.md): size a VM's memory reservation and limit without ballooning or wasted host capacity.
- [Proxmox VE](https://memorylimit.dev/proxmox/index.md): set a VM's memory and ballooning minimum, handy when migrating from VMware.

## Data stores

- [Redis maxmemory](https://memorylimit.dev/redis/index.md): size maxmemory for a Redis cache and the host memory it needs around it.
- [Couchbase memory quotas](https://memorylimit.dev/couchbase/index.md): set Data, Index and Search service quotas and each bucket's quota from the dataset.

## How the numbers are calculated

- [The shared sizing model](https://memorylimit.dev/sizing-model/index.md): the formula, margin tables and assumptions every calculator uses. Each calculator also has its own "how it works" guide.
