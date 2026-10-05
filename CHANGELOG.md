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

### Changed

- Calculators are grouped by category on the landing page and in the nav (#11).
- Manual values are shown first and are the default input mode (#12).
- Results round to whole units (M, Mi, MB, MiB) per platform, with documented minimums, for Kubernetes, Docker Compose, Nomad, Lambda, Cloud Run, systemd, vSphere, Proxmox VE and Redis (#16, #17, #19–#26).
- Azure Functions defaults to Microsoft's 2,048 MB instance size and shows CPU per size (#22, #27).
- Cloud Run applies Google's concurrency formula (#21, #29).
- vSphere follows VMware's advice: configured memory as the cap, no limit (#24, #30).
- systemd sets `MemoryMax` to 1.25 × `MemoryHigh`, with the references behind the ratio (#23, #31).
- End-to-end tests moved from `e2e/` to `tests/e2e/`.

### Fixed

- Lambda uses decimal MB for MiB and `--function-name` in the generated CLI command (#20).
- Cloud Run CPU wording (#21).
- vSphere power-on reason (#24).
- Docker Compose service-level alternative (#17).
- Kubernetes: Guaranteed QoS needs CPU as well as memory (#16).
- systemd advice updated for cgroup v1 (#23).
- Phone layout issues on the Azure Functions page (#22).

### Removed

- EthicalAds from the privacy page while ads are disabled (#8).
