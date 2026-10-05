# Changelog

All notable changes to MemoryLimit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
MemoryLimit is a continuously deployed static site and has no versioned releases,
so entries are grouped under `Unreleased` until a release is tagged.

## [Unreleased]

### Added

- Calculators for Azure Functions (#9), Couchbase (#13), Nomad (#19), Cloud Run (#21), Lambda (#20), vSphere (#24), Proxmox VE (#25) and Redis (#26).
- A guide page for each calculator, explaining its sizing model, plus a shared page on the common model (#14, #16, #17, #19–#26).
- Field tooltips and links between each assumption label and its row in the table (#14, #18).
- An "Advanced: margins and defaults" section on every calculator, closed by default, to replace the request and limit margins; each field has a tooltip and each guide a "Values you can change" table.
- A report link under each calculator result (#10).
- Kubernetes request basis option: VPA-style, peak + 15% (#28); under Advanced, the VPA margin and minimum and the overcommit warning's ratio can be changed.
- GitHub Sponsors links, a `/support/` page and issue forms (#4).
- Content-Security-Policy and other security headers, Open Graph share image, logo and favicon.
- Redis: the provisioning factor (2 × maxmemory by default, about 1.25× without persistence) can be changed under Advanced.

### Changed

- ADR 0015 records the EthicalAds removal and supersedes ADRs 0008 and 0009 (#47).
- Calculators are grouped by category on the landing page and in the nav (#11).
- Manual values are shown first and are the default input mode (#12).
- Results round to whole units (M, Mi, MB, MiB) per platform, with documented minimums, for Kubernetes, Docker Compose, Nomad, Lambda, Cloud Run, systemd, vSphere, Proxmox VE and Redis (#16, #17, #19–#26).
- Azure Functions defaults to Microsoft's 2,048 MB instance size and shows CPU per size (#22, #27); the minimum instance size can be changed under Advanced.
- Cloud Run applies Google's concurrency formula (#21, #29).
- vSphere follows VMware's advice: configured memory as the cap, no limit (#24, #30).
- systemd sets `MemoryMax` to 1.25 × `MemoryHigh`, with the references behind the ratio (#23, #31); the ratio can be changed under Advanced.
- End-to-end tests moved from `e2e/` to `tests/e2e/`.
- Couchbase: the metadata per document, overhead, high-water mark, storage engine and two warning thresholds can be changed under "Advanced: sizing defaults and thresholds".

### Fixed

- Lambda uses decimal MB for MiB and `--function-name` in the generated CLI command (#20).
- Cloud Run CPU wording (#21).
- vSphere power-on reason (#24).
- Docker Compose service-level alternative (#17).
- Kubernetes: Guaranteed QoS needs CPU as well as memory (#16).
- systemd advice updated for cgroup v1 (#23).
- Couchbase bucket quotas are per node, as `--bucket-ramsize` expects: the generated `bucket-edit` command passed the cluster-wide total, which Couchbase refuses on more than one Data node.
- Grafana CSV rows with an empty value cell are skipped instead of reading their timestamp as a sample.
- vSphere memory size rounds up to a multiple of 4 MB, the only sizes vSphere accepts.
- The favicon keeps its light and dark colours under the stricter CSP: `/favicon.svg` drops the page policy, whose `style-src 'self'` blocked its inline `<style>`.
- Couchbase: a pasted bucket list with nothing to size (only ephemeral or Memcached buckets) no longer removes the buckets entered, and a Prometheus paste without `kv_curr_items` for a bucket says its document count wasn't read.
- The count of changed advanced settings updates when the Kubernetes VPA settings are shown or hidden.
- Couchbase: identical `kv_curr_items` lines from nodes' own `/metrics` are added up as different nodes instead of merged as one series, which counted only one node's documents; the feedback says how many nodes a count covers. An aggregated query result without a metric name is read as the item count (#45).
- A Grafana CSV with a date column no longer drops a steadily growing first series in the 1–9 GiB range as a time column, and a whole `redis-cli INFO memory` paste reads only `used_memory` (#45).
- Couchbase: the `couchbase-cli` snippet says to run `bucket-edit` first when lowering quotas, and bucket names outside Couchbase's rule are rejected, so nothing unquoted reaches the shell commands (#46).
- Cloud Run's `service.yaml` and Azure Functions' Bicep snippets are nested as the real files are, instead of dotted paths (#47).
- Redis shows the memory to provision in MiB, the unit of its `mb` (#47).
- Out-of-date README, ADR and tagline statements after the recent changes, and the privacy page now mentions the stored theme choice (#47).
- Phone layout issues on the Azure Functions page (#22).

### Removed

- EthicalAds from the privacy page while ads are disabled (#8).
- EthicalAds integration (slot, script, CSP hosts and `'unsafe-inline'` in `style-src`); it was never enabled. It is kept on the `feat/ethicalads` history for later.
