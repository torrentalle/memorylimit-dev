# 7. Host on Cloudflare Pages

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The site is a folder of static files ([ADR 0002](0002-static-client-side-site-without-build-step.md)). Hosting
needs:

- HTTPS on a custom domain;
- deploy on push, with a preview for each pull request;
- real HTTP redirects for aliases such as `/k8s/`;
- custom response headers ([ADR 0009](0009-content-security-policy-without-inline-scripts.md));
- no per-request cost.

The analytics ([ADR 0008](0008-cookieless-analytics-and-non-tracking-ads.md)) also come from Cloudflare.

## Decision

- **Where:** deploy `public/` to Cloudflare Pages with no build command, from the GitHub repository.
- **Configuration files:** redirects live in `public/_redirects` and headers in `public/_headers`. Both are
  plain files that Pages reads at deploy time.
- **No other host's config:** the earlier `vercel.json` was removed, so there is one deployment target and
  one place to look.
- **Caching:** the favicon and share image get a one-day cache. JS and CSS keep Pages' default revalidation
  (ETag with `must-revalidate`), because their filenames aren't content-hashed.

## Alternatives considered

- **Vercel or Netlify.** Equivalent static hosting. They were dropped to keep hosting, DNS and analytics under
  one provider, with no build step to configure.
- **GitHub Pages.** It supports neither custom response headers nor server-side redirects, so it can't send a
  CSP header or a real 301 redirect.

## Consequences

- A deploy is a `git push`. Previews come for free.
- `_redirects` and `_headers` only take effect on Cloudflare. The local server (`serve`) ignores them, so tests
  inject the CSP themselves, and `/k8s/` has a meta-refresh fallback page.
- Moving to another host means translating these two files into that host's format.
- Returning visitors revalidate JS and CSS on each visit, and get a cheap 304 when nothing changed. Adding
  content hashing would need a build step.
