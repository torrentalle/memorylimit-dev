# 13. Development environment via Cloudflare Pages branch preview deployments

- **Status:** Accepted
- **Date:** 2026-09-26
- **Supersedes:** [0012](0012-development-subdomain-via-separate-pages-project.md)'s deployment topology
  (only that part — the reasoning for Cloudflare Access and for `public/js/env.js`'s production-host
  allowlist is unchanged and carried forward below).

## Context

[ADR 0012](0012-development-subdomain-via-separate-pages-project.md) set up the dev environment as a
second Cloudflare Pages project, with its own production branch (`develop`), connected to the same
repository. Cloudflare Pages already builds a preview deployment for every branch other than a project's
production branch, at a predictable URL (`<branch>.<project>.pages.dev`), and lets a custom domain be
attached to those preview deployments, scoped to a specific branch. That gives the same outcome — a
stable `dev.memorylimit.dev` tracking the `develop` branch — inside the one project that already exists,
rather than provisioning and maintaining a second one.

## Decision

- **One Cloudflare Pages project**, the existing one, with `main` as its production branch — unchanged.
- **`develop`** (created under ADR 0012, kept as-is as the initial branch this is exercised on) is an
  ordinary git branch with no special meaning to the code. Pushing to it produces a Cloudflare Pages
  preview deployment automatically, at `develop.<project>.pages.dev`, with no per-branch dashboard setup.
- **`dev.memorylimit.dev`** is added as a custom domain scoped to preview deployments of the `develop`
  branch, inside that same project's *Custom domains* settings, rather than as a separate project's own
  domain.
- **Cloudflare Access still gates it**, exactly as ADR 0012 decided — applied to the custom domain, same
  as it would have been on a second project. This part of the decision is unchanged.
- **`public/js/env.js`'s production-host allowlist is unchanged**, and is, if anything, better justified
  now: production and dev share the literal same Cloudflare Pages project and the same `_headers`,
  `_redirects` and JS files, so nothing in Cloudflare's own configuration tells them apart — the
  app-level `isProductionHost()` check is the only thing that does.

## Alternatives considered

- **A second Cloudflare Pages project** (ADR 0012's original choice). Reconsidered in favour of the
  project's own branch-preview feature: one project's settings to keep correct (custom domains,
  redirects, headers — all of it already comes from files in this repository, so there was never
  anything to duplicate) instead of two, and no risk of the two projects' dashboard configuration
  drifting apart over time.

## Consequences

- One Cloudflare Pages project instead of two; less dashboard surface, one place to look.
- Every other branch (feature branches, pull requests) still gets its own ordinary, unlabelled Cloudflare
  Pages preview URL exactly as before — this only turns `develop`'s preview into a friendly, stable,
  Access-gated domain.
- Setting it up is still entirely Cloudflare-dashboard and DNS work: a custom domain on the existing
  project, scoped to the `develop` branch, plus a Cloudflare Access application for it. Nothing in the
  repository changes because of this ADR.
