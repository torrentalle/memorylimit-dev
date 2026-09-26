# 12. Development subdomain: a second Cloudflare Pages project, gated by Access

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

Cloudflare Pages already gives every pull request an ephemeral preview deployment
([ADR 0007](0007-host-on-cloudflare-pages.md)), but there was no stable URL to develop against, share
with a tester, or leave running for longer than a PR's lifetime.

Whatever that URL turns out to be, it must not become a second, uncontrolled source of real analytics
readings or real ad impressions: `monetization.js` and `analytics.js` only check whether an ID is
configured, not where the page is being served from, so the moment real EthicalAds/Cloudflare Analytics
IDs are set, *every* place the site runs — a PR preview, a dev subdomain, `npm run dev` on localhost —
would start reporting as if it were real traffic.

## Decision

- **A second Cloudflare Pages project**, connected to the same GitHub repository, with `develop` as its
  own production branch. `dev.memorylimit.dev` is a custom domain on that project, pushes to `develop`
  deploy it, and it never touches the `main`/production project's settings.
- **Gated by Cloudflare Access.** The dev project sits behind Cloudflare Zero Trust: only people it is
  explicitly shared with can reach it at all. That is a stronger guarantee than a `noindex` header would
  be, it needs nothing from the repo (a single `public/_headers` file can't vary by hostname anyway,
  since the same files serve every deployment), and it is configured once in the Cloudflare dashboard.
- **A single source of truth for "am I production?".** [`public/js/env.js`](../../public/js/env.js) exports
  `PRODUCTION_HOST = 'memorylimit.dev'` and `isProductionHost(hostname)`. `getEthicalAdsConfig()` and
  `getCloudflareAnalyticsConfig()` ([ADR 0008](0008-cookieless-analytics-and-non-tracking-ads.md)) now
  also require `isProductionHost()` before returning a config, in addition to the ID being set. The check
  reads `location.hostname` by default and returns `false` when `location` doesn't exist at all (Node
  tests), so the safe default everywhere but the live production domain is "off".

## Alternatives considered

- **A custom domain restricted to one branch, inside the existing production project.** Cloudflare Pages
  supports scoping a custom domain to non-production ("preview") deployments, which would need only one
  project. It was rejected for being a less standard, less documented corner of the dashboard than a
  plain second project with its own production branch — the second project is more obviously correct to
  someone reading the Cloudflare dashboard later.
- **`memorylimit.net` instead of `memorylimit.dev` for the subdomain.** The project owns both, but every
  canonical URL, the sitemap and the Open Graph tags already use `memorylimit.dev`
  ([ADR 0005](0005-multi-page-static-html-with-generated-shared-blocks.md)), so keeping the dev subdomain
  in the same family avoids a second, unrelated-looking domain in the mix.
- **`noindex` instead of Cloudflare Access.** Simpler, and enough to keep the dev site out of search
  results, but it is only a request — nothing stops a crawler or a stranger with the link from reading it.
  Access makes it unreachable outright, which matters more for a site that may carry unfinished or
  half-tested content.
- **Gating third parties by a build-time environment variable.** The site has no build step
  ([ADR 0002](0002-static-client-side-site-without-build-step.md)), so there is no build-time environment
  to read from; a runtime hostname check is the only mechanism that works identically wherever the exact
  same static files end up being served.

## Consequences

- Setting the dev site up is entirely Cloudflare-dashboard and DNS work (a second Pages project, a
  custom domain, an Access policy); nothing in the repository has to change for it to exist, and
  `develop` is an ordinary git branch with no special meaning to the code itself.
- Only `memorylimit.dev` ever produces a real Cloudflare Analytics reading or loads the real EthicalAds
  script, even once real IDs are configured. Every other place the exact same files run — the dev
  subdomain, a PR preview, `npm run dev` — sees monetization and analytics as unconfigured. This is
  covered by `tests/env.test.js`, the added cases in `tests/analytics.test.js` and
  `tests/monetization.test.js`, and an `e2e/csp.spec.js` test that asserts zero requests to either
  third party when running off the production host.
- If the site ever legitimately needs a second production-like hostname (a `www.` alias, a rebrand),
  `PRODUCTION_HOST` becomes a small allowlist; today it is a single string because there is only one.
- Anyone who needs to see the dev site has to be added to the Cloudflare Access policy individually —
  a small amount of ongoing admin in exchange for the site never being an accidental public leak.
