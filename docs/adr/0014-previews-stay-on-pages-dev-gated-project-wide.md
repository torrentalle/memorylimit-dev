# 14. Previews stay on `*.pages.dev`, gated project-wide — `memorylimit.dev` is the only custom domain

- **Status:** Accepted
- **Date:** 2026-09-26
- **Supersedes:** [0013](0013-development-environment-via-branch-preview-deployments.md)'s
  `dev.memorylimit.dev` custom domain (only that part — one Cloudflare Pages project rather than two, and
  `public/js/env.js`'s production-host allowlist, are unchanged and carried forward below).

## Context

[ADR 0013](0013-development-environment-via-branch-preview-deployments.md) planned a
`dev.memorylimit.dev` custom domain, scoped to the `develop` branch's Cloudflare Pages preview
deployments. That still left every *other* branch — any feature branch, any pull request — reachable
only at Cloudflare's own `<branch-or-hash>.<project>.pages.dev` domain: a second, de facto public surface
that sat outside `memorylimit.dev` entirely, wasn't mentioned anywhere in the README, and wasn't gated by
anything. The project should have exactly one domain it intentionally exposes and documents.

## Decision

- **`memorylimit.dev` is the project's only custom domain.** No `dev.memorylimit.dev` or any other
  subdomain is created.
- **Every preview deployment — `develop`'s and any other branch's — stays on Cloudflare's own
  `*.<project>.pages.dev` domain.** This is inherent to how Cloudflare Pages works and isn't something a
  project's custom domain settings can turn off; the decision here is to stop treating that as an
  implementation detail and document it plainly instead (see the README's
  "Development / staging environment" section).
- **Cloudflare Access is applied to the whole `*.<project>.pages.dev` hostname** (one wildcard Access
  application for the project), rather than to a single branch's custom domain. Every preview deployment,
  from any branch, needs a login before it can be opened — there is no branch that is accidentally
  unprotected.
- **`public/js/env.js`'s production-host allowlist is unchanged** and needs no change: it already treats
  every hostname other than exactly `memorylimit.dev` — which includes every `*.pages.dev` hostname — as
  non-production.

## Alternatives considered

- **A custom domain scoped to the `develop` branch** (ADR 0013's plan). It gives `develop` a tidy,
  memorable URL, but does nothing for any other branch's preview, which is exactly the gap this ADR
  closes. Protecting the whole `*.pages.dev` domain with one Access policy covers every branch uniformly,
  needs no DNS record or per-branch Pages configuration to keep in sync, and matches wanting a single,
  clearly documented domain rather than a second one that only covers part of the problem.

## Consequences

- Exactly one custom domain exists for the project: `memorylimit.dev`.
- Opening any preview — `develop`'s or a feature branch's — needs a Cloudflare Access login; the README
  states the URL pattern (`https://<branch>.<project>.pages.dev`) and the Access requirement explicitly,
  rather than leaving Cloudflare Pages' preview behaviour as an unstated implication.
- Sharing a specific in-progress preview means copying its `*.pages.dev` URL from the Cloudflare Pages
  dashboard's deployment list and adding the recipient to the Access policy, rather than pointing them at
  one fixed, memorable `dev.` address. That is the trade-off for having no second domain to maintain and
  no branch left unprotected by default.
