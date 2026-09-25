# 5. Multi-page static HTML with generated shared blocks

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Each platform needs its own URL, title, description, canonical link and Open Graph tags. People search for
"Kubernetes memory limit calculator" or "Lambda memory size", not for a generic tool. The navigation and the
landing page's list of calculators appear on every page and have to stay identical. With no build step
([ADR 0002](0002-static-client-side-site-without-build-step.md)), there are no templates or includes to share
them.

## Decision

- **Pages:** one real HTML page per platform at a clean path (`/kubernetes/`, `/lambda/`, …), plus the landing
  and privacy pages. Every page is complete static HTML, with its own metadata written into it.
- **Navigation:** the header nav is a native `<details>` dropdown. The landing page lists every calculator as
  plain links. Both work without JavaScript.
- **Generated blocks:** the nav and the landing cards are generated from `platforms.js` by
  `npm run sync:pages`. The script rewrites only the region between `<!-- platform-nav:start/end -->` or
  `<!-- platform-cards:start/end -->` markers, and marks the current page with `aria-current`.
- **Disabled platforms:** at runtime, JavaScript only removes links to platforms disabled in
  `ENABLED_PLATFORMS`. It never builds the nav.
- **Checks:** `tests/pages.test.js` fails when a page is out of sync with what `sync:pages` would produce. It
  also fails when a page misses an element ID that `app.js` needs, or when its canonical and Open Graph tags
  don't match its own path.
- **Aliases:** they are real redirects (`_redirects`), with a meta-refresh page as a fallback.

## Alternatives considered

- **A single-page app with client-side routing.** Only one set of static metadata for crawlers and link
  previews, and nothing works without JavaScript.
- **Building the nav with JavaScript on every page.** No duplicated markup, but the nav would be missing until
  scripts run, invisible without JavaScript, and weaker for crawlers.
- **A static site generator.** It solves the duplication properly, but brings back the build step and its
  toolchain for about a dozen pages.

## Consequences

- Every page is fast, indexable and usable without JavaScript.
- The shared blocks are duplicated across the HTML files. The generator keeps them identical, and a test
  catches manual edits or a forgotten `sync:pages`.
- Content outside the markers (head metadata, intros, paste hints) is still maintained by hand in each page.
