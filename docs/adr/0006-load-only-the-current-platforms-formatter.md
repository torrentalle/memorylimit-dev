# 6. Load only the current platform's formatter

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Each calculator page needs the shared calculator code plus exactly one formatter
([ADR 0004](0004-pure-sizing-core-with-per-platform-formatters.md)). At first, each page had an inline
`<script type="module">` that imported its formatter statically. The Content-Security-Policy
([ADR 0009](0009-content-security-policy-without-inline-scripts.md)) rules out inline scripts. Import maps
don't help either, because they are inline too. Without a bundler, the entry point therefore has to be an
external file.

## Decision

- **Shared entry point:** every calculator page loads the same external entry point,
  [`calculator-page.js`](../../public/js/calculator-page.js).
- **Platform lookup:** the page declares its platform as `<body data-platform="…">`. The entry point looks the
  platform up in `platforms.js` and loads only that formatter, using `import()` with the URL from
  `formatterUrl()`. An unknown platform throws.
- **Preload:** each page also has `<link rel="modulepreload">` for its formatter. The browser then fetches it
  in parallel with the entry point, so the dynamic import adds no network round trip.
- **Readiness flag:** the window `load` event doesn't wait for dynamic imports. So once the calculator is wired
  up, the page sets `<html data-calculator-ready>`. Browser tests wait for it through `tests/e2e/fixtures.js`
  instead of typing into a page that isn't listening yet.

## Alternatives considered

- **One small entry file per platform** that imports its formatter statically. It needs no readiness flag, but
  adds nine near-identical files to keep in step with the registry.
- **One entry point that imports every formatter.** Simple, but every page would download all nine platforms'
  code.

## Consequences

- One entry point serves every calculator page, and `/lambda/` never downloads Kubernetes code.
- The page's platform, its preload link and the registry must agree. `tests/pages.test.js` checks this for
  every page.
- Anything that automates the page must wait for `data-calculator-ready`, not only for `load`.
