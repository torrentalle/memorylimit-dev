# 2. Static, client-side site with no build step

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The input people paste into MemoryLimit is production telemetry: metric names, pod and service names,
namespaces and memory figures from their infrastructure. Many teams aren't allowed to send that to a
third-party server, and would rightly hesitate to. Separately, the tool is small (arithmetic, text
parsing, string output) and should cost close to nothing to host and maintain for years.

## Decision

- All computation runs in the browser. There is no backend and no API; pasted data never leaves the page.
- `public/` is the deployed site, exactly as it is in the repository: hand-written HTML, one stylesheet and
  native ES modules, served as static files.
- No framework, no bundler, no transpiler and no runtime dependencies. `package.json` lists only development
  tools (a static file server and Playwright).
- Fonts (IBM Plex) are self-hosted, so no request goes to a font CDN.

## Alternatives considered

- **A framework such as React or Svelte with Vite.** It would make the shared page chrome easier (see
  [ADR 0005](0005-multi-page-static-html-with-generated-shared-blocks.md)), but it adds a build step, a
  dependency tree to keep patched and a larger download. None of that is needed for a form and a results panel.
- **A server-side API for the sizing logic.** That would mean running a server and receiving user telemetry,
  which is exactly what the privacy promise rules out.

## Consequences

- "Nothing you paste leaves the browser" is true by construction, and is simple to verify in the network panel.
- Deployment is uploading a folder. There is nothing to break between the repository and production.
- There is no compile-time help: no type checking, and no module or template reuse across HTML pages. Tests
  have to make up for it ([ADR 0010](0010-testing-strategy.md)).
- Asset filenames aren't content-hashed, so JS and CSS can't be given long cache lifetimes
  ([ADR 0007](0007-host-on-cloudflare-pages.md)).
- Pages must be served over HTTP (`npm run dev`), because browsers don't load ES modules from `file://` URLs.
