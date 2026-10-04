<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/memorylimit-logo-on-dark.svg">
    <img src="public/brand/memorylimit-logo.svg" alt="MemoryLimit" width="360">
  </picture>
</p>

# MemoryLimit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/torrentalle/memorylimit-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/torrentalle/memorylimit-dev/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/torrentalle/memorylimit-dev?style=flat)](https://github.com/torrentalle/memorylimit-dev/stargazers)

A memory sizing calculator for containers, serverless, VMs and Redis: **Kubernetes**, **Docker Compose**,
**HashiCorp Nomad**, **AWS Lambda**, **Google Cloud Run**, **Azure Functions**, **systemd** services on VMs or bare metal,
**VMware vSphere**, **Proxmox VE** and **Redis `maxmemory`**. Paste real usage data — Prometheus output,
Grafana CSV, CloudWatch exports, `redis-cli INFO` — pick a workload profile, and get a ready-to-use
configuration with a plain-English explanation and warnings for risky setups.

It's a static site with no backend and no build step. Everything runs in the browser; nothing you paste
leaves it.

## Support

Questions go to [Discussions](https://github.com/torrentalle/memorylimit-dev/discussions); bugs and platform
requests to [Issues](https://github.com/torrentalle/memorylimit-dev/issues/new/choose). See [SUPPORT.md](SUPPORT.md).
If MemoryLimit saved you time, a star helps others find it.

## Features

- **Nine platforms, one engine.** A platform-agnostic core computes unrounded MiB figures; small formatters
  turn them into each platform's native settings and commands.
- **Paste almost anything.** Prometheus/OpenMetrics exposition, the Prometheus UI range table (including
  PromQL expression results), HTTP API JSON, Grafana CSV (date or epoch columns), CloudWatch Logs Insights
  exports, `kubectl top`, `redis-cli INFO` / `systemctl show` lines, and values with units (`412 MiB`,
  `1.2 GiB`). Pause-container and pod-level cAdvisor series are skipped automatically.
- **Output that the platform will accept.** Every two-value platform guarantees its lower setting never
  exceeds its upper one (Docker, vSphere and Proxmox all reject that), and single-value platforms are clamped
  to their allowed ranges.
- **Accessible and fast.** Static HTML that works without JavaScript for navigation, WCAG AA contrast in both
  themes, no theme flash, self-hosted fonts, no framework.

## Quick start

```bash
npm install   # dev server + browser tests only; unit tests need nothing installed
npm run dev   # serves public/ at http://localhost:3000
```

Pages use ES modules and root-relative paths, so serve `public/` over HTTP rather than opening files directly.

## How the sizing works

**Request** = average usage × (1 + margin) and **limit** = peak usage × (1 + margin), where each margin is

1. a base from sensitivity — request 15 / 30 / 50 %, limit 20 / 30 / 40 % (low / medium / high),
2. plus a workload adjustment — request: JVM +15 %, cache +5 %, worker −10 %; limit: worker +35 %, JVM +30 %,
3. scaled by environment — development × 0.6, staging × 0.85, production × 1.0.

`calculateRawSizing()` stops there and returns unrounded MiB values. Each formatter then applies its
platform's rules:

| Platform | Output | Rules |
| --- | --- | --- |
| Kubernetes — Burstable | `requests` < `limits` | Request rounds up to 32 Mi. Limit rounds up to 64 Mi, never below 1.2× the rounded request. Warns when the limit exceeds 4× the request (node overcommit → evictions). |
| Kubernetes — Guaranteed | `requests` = `limits` | One value covering both the peak-based limit and the average-based request, rounded up to 64 Mi. |
| Docker Compose | `reservations` ≤ `limits` | Both round up to 10 M; the limit is raised to the reservation for steady workloads. Also shows the `mem_limit` equivalent. |
| HashiCorp Nomad | `memory` < `memory_max` | Same model and rounding as Kubernetes Burstable. `memory_max` needs memory oversubscription enabled on the cluster. |
| AWS Lambda | `MemorySize` | Peak-based (running out is a hard failure), rounded up to 1 MB, clamped to 128–10240 MB. |
| Google Cloud Run | `--memory` | Peak-based, rounded up to 64 Mi, clamped to 128 Mi–32 Gi, with the minimum vCPU Cloud Run requires above 4 GiB. |
| Azure Functions | Instance size | Peak-based, rounded up to the next Flex Consumption size (512, 2048 or 4096 MB); above 4096 MB it switches to the smallest Elastic Premium SKU (EP1–EP3) that fits. The legacy Consumption plan is fixed at 1.5 GB and isn't sized. |
| systemd | `MemoryHigh` < `MemoryMax` | `MemoryHigh` (throttle) sits just above the observed peak, rounded up to 32 M, so normal peaks never throttle. `MemoryMax` (OOM-kill) is 1.2× `MemoryHigh`, rounded up to 64 M. Needs cgroup v2. |
| VMware vSphere | reservation ≤ limit | Reservation (average-based) rounds up to 128 MB, limit (peak-based) to 256 MB; shares stay Normal. vSphere Client steps plus a `govc vm.change` command. |
| Proxmox VE | `balloon` ≤ `memory` | Minimum memory (average-based) rounds up to 128 MiB, memory (peak-based) to 256 MiB. `qm set` command plus web UI steps. |
| Redis | `maxmemory` | Peak `used_memory` + margin, rounded up to 64 MB, with `allkeys-lru`. Recommends 2× `maxmemory` for the host or container to cover persistence forks. |

Rounding tolerates floating-point noise, so 200 × 1.12 = `224.00000000000003` still rounds to 224 Mi, not 256.

## What to paste

A **range query** over a representative period gives the best result: every sample is averaged and the highest
becomes the peak. An instant query only gives one value per pod. Each calculator page explains where to get
its numbers; the common sources are:

| Platform | Source |
| --- | --- |
| Kubernetes, Docker Compose | `container_memory_working_set_bytes{namespace="prod", container="api"}` |
| Nomad | `nomad_client_allocs_memory_usage{task="api"}` |
| systemd | `container_memory_working_set_bytes{id="/system.slice/myapp.service"}`, or `systemctl show -P MemoryCurrent myapp.service` sampled in a loop |
| vSphere, Proxmox (measure in the guest) | `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes` |
| Lambda | CloudWatch Logs Insights: `fields @maxMemoryUsed \| filter @type = "REPORT"` |
| Cloud Run | Container memory utilization × current limit (Cloud Monitoring reports a percentage) |
| Azure Functions | Application Insights Private Bytes counter (average and max), where your plan reports it |
| Redis | `redis_memory_used_bytes`, or `redis-cli INFO memory \| grep '^used_memory:'` sampled in a loop |

Unitless values are treated as bytes unless every one is below 1,000,000, in which case they're read as MiB.
The feedback line reports how many samples were parsed, skipped (pause/pod-level series) or unreadable.

## Project structure

```
public/                     deployed as-is
  index.html                landing page
  kubernetes/ docker-compose/ nomad/ lambda/ cloud-run/ azure-functions/
  systemd/ vmware/ proxmox/ redis/        one calculator page per platform
  privacy/ support/         what the site collects; where to get help (GitHub links)
  k8s/                      meta-refresh fallback for the /k8s/ alias
  css/styles.css
  fonts/                    self-hosted IBM Plex (SIL OFL 1.1)
  js/
    calculator.js           pure sizing math
    prometheus-parser.js    pure paste parsing
    formatters/             pure platform output, one module per platform (+ shared.js)
    platforms.js            ENABLED_PLATFORMS + platform metadata (labels, paths, taglines)
    monetization.js         MONETIZATION config
    links.js                GitHub repo / issue-form URLs (footer and /support/)
    analytics.js            ANALYTICS config
    app.js                  calculator page wiring
    calculator-page.js      entry point of every calculator page (reads <body data-platform>)
    site.js                 shared chrome: theme toggle, nav, analytics beacon, footer slots
    theme-init.js           applies the saved theme before first paint (blocking, in <head>)
    theme.js nav.js landing.js monetization-ui.js
  brand/                    logo and monogram SVGs (generated)
  _redirects _headers robots.txt sitemap.xml og-image.png
  favicon.ico favicon.svg apple-touch-icon.png           (generated)
docs/adr/                   Architecture Decision Records
tests/                      unit + page-structure tests (node:test)
e2e/                        Playwright smoke tests + CSP enforcement
scripts/                    sync-pages.js, generate-sitemap.js, generate-og-image.js (+ og-image-stamp.js),
                            generate-brand.js (+ brand/logo.js, the logo's geometry)
og-image-source.html        template rendered to public/og-image.png
og-image.stamp.json         hashes of what og-image.png was rendered from (checked by tests)
```

### Design notes

The reasoning behind each of these, and the alternatives that were rejected, is recorded in
[docs/adr/](docs/adr/README.md).

- **Pure core, thin shell.** Everything under `js/formatters/`, plus `calculator.js` and
  `prometheus-parser.js`, is DOM-free and returns plain data (roles such as `request` / `limit`, not CSS
  classes). `app.js` maps that data onto the page, so the same modules run unchanged in Node tests or a
  server.
- **Native ES modules, no bundler.** Each calculator page loads exactly one formatter, so `/lambda/` never
  downloads the Kubernetes code. `calculator-page.js` imports it based on `<body data-platform>`, and a
  `<link rel="modulepreload">` fetches it in parallel.
- **No inline JavaScript.** Every script is an external file and there are no inline event handlers, so the
  Content-Security-Policy can forbid inline scripts outright (see [Security headers](#security-headers)).
- **Static-first HTML.** The header nav is a `<details>` dropdown and the landing page lists every calculator
  as plain links, so both work without JavaScript. Both blocks are generated from `platforms.js` by
  `npm run sync:pages`; JavaScript only removes links to disabled platforms. `tests/pages.test.js` fails if a
  page is out of sync, or is missing an element ID that `app.js` expects.

## Configuration

Three plain objects, each in its own module:

| File | Object | Controls |
| --- | --- | --- |
| `public/js/platforms.js` | `ENABLED_PLATFORMS` | Which calculators appear in the nav, on the landing page and in the sitemap. If only one is enabled, `/` redirects to it. Run `npm run generate:sitemap` after changing it. |
| `public/js/monetization.js` | `MONETIZATION` | EthicalAds text ad (needs a publisher ID from [ethicalads.io](https://www.ethicalads.io/)) and a GitHub Sponsors / Buy Me a Coffee link (needs an absolute `https://` URL). |
| `public/js/analytics.js` | `ANALYTICS` | Cloudflare Web Analytics beacon (needs a token from the Cloudflare dashboard). Cookieless, so there is no consent banner. |

Each element renders only when it is switched on **and** configured. The shipped placeholders
(`REPLACE_WITH_…`) render nothing and load no third-party scripts. Configured or not, `public/js/env.js`
also keeps both silent everywhere except the production host itself, so a preview or local run never
pollutes real analytics or serves real ads.

## Adding a platform

1. Add a flag to `ENABLED_PLATFORMS` and a definition (id, label, path, tagline) to `PLATFORM_DEFINITIONS` in
   `public/js/platforms.js`.
2. Add `public/js/formatters/<name>.js` exporting `format(raw)`; copy the shape another formatter returns.
3. Copy an existing calculator page to `public/<name>/index.html` and adjust its metadata, intro, paste hint,
   `<body data-platform>` and the formatter's `modulepreload` link.
4. Run `npm run sync:pages && npm run generate:sitemap`, then add `tests/formatters/<name>.test.js`.
   `tests/pages.test.js` checks the new page automatically.

## Testing

```bash
npm test                                   # unit + page-structure tests, no install needed
npx playwright install chromium            # once
npm run test:e2e                           # browser smoke tests against a local server
PW_CHANNEL=msedge npm run test:e2e         # or reuse an installed Edge/Chrome instead
```

`.github/workflows/ci.yml` runs both suites on every push and pull request to `main`.

## Deployment

The site is the contents of `public/`, served as-is with no build step.

- **Redirects:** `public/_redirects` issues a 301 from `/k8s/` to `/kubernetes/`. `public/k8s/index.html` is a
  meta-refresh fallback for hosts that ignore `_redirects`. Add future aliases the same way.
- **Caching:** `public/_headers` gives the favicon and share image a one-day cache. JS and CSS keep the
  default revalidation because their filenames aren't content-hashed.
- **Security headers:** see below.
- **Share image:** `public/og-image.png` is rendered from `og-image-source.html` by hand and committed;
  nothing regenerates or commits it automatically. After changing the source, its fonts or the logo, run
  `npm run generate-og-image` and commit the PNG together with `og-image.stamp.json`.
  `tests/og-image.test.js` compares that stamp with the current source, the files it uses and the PNG, so
  CI fails on a pull request that changes any of them without re-rendering the image.
- **Logo and icons:** `scripts/brand/logo.js` holds the logo's geometry. `npm run generate:brand` writes the
  SVGs in `public/brand/`, `favicon.svg`, `favicon.ico` and `apple-touch-icon.png` from it, and
  `tests/brand.test.js` fails if the committed SVGs drift from the generator. The header shows the colour
  monogram on light themes and the light-grey one on dark themes. See
  [ADR 0011](docs/adr/0011-logo-as-generated-svg.md).

### Security headers

`public/_headers` sends a Content-Security-Policy, `X-Content-Type-Options: nosniff`, a
`strict-origin-when-cross-origin` Referrer-Policy and a Permissions-Policy that turns off the camera,
microphone, geolocation, payment and USB APIs on every page. The CSP defaults to `'self'` and allows only
these third-party hosts:

| Host | Directive | Why |
| --- | --- | --- |
| `media.ethicalads.io` | `script-src`, `img-src` | EthicalAds client script, ad images, ad-block probe pixel |
| `server.ethicalads.io` | `script-src`, `img-src` | Ad decision (loaded as a JSONP script), view-tracking pixel |
| `static.cloudflareinsights.com` | `script-src` | Cloudflare Web Analytics beacon |
| `cloudflareinsights.com` | `connect-src` | Beacon reports |

`style-src` allows `'unsafe-inline'` only because the EthicalAds client injects a `<style>` element. Scripts
can never be inline or use `eval`, and the site can't be framed (`frame-ancestors 'none'`).

The host applies these headers at deploy time. `serve`, used locally and in CI, ignores them, so
`e2e/csp.spec.js` injects the policy into every HTML response instead and fails on any violation. It
covers every page, plus a run with both third parties switched on and stubbed to behave like the real
scripts. `tests/headers.test.js` pins the policy itself. If you add a third party, add its hosts to both
files. To check the live site, run `curl -sI https://memorylimit.dev/ | grep -i content-security`.

## License

[MIT](LICENSE). IBM Plex fonts are licensed under the [SIL Open Font License 1.1](public/fonts/OFL.txt).
