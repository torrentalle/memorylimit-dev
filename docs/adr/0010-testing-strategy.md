# 10. Testing strategy

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

With no compiler, bundler or templates ([ADR 0002](0002-static-client-side-site-without-build-step.md)),
several classes of mistake would reach production unnoticed:

- wrong numbers;
- a page that has drifted from the others;
- a missing element ID or asset;
- a policy that blocks a script;
- a UI that breaks only in a real browser.

The tests have to catch these, while staying cheap enough to run on every change.

## Decision

Three layers, all run in CI (`.github/workflows/ci.yml`) on every push and pull request to `main`:

1. **Unit tests** with `node:test` and no installed dependencies (`npm test`):
   - the sizing model, including input validation and the floating-point rounding tolerance;
   - the paste parser, across every supported input format;
   - each formatter's rounding, clamping and ordering invariants.
2. **Structure tests,** also with `node:test`, that read the HTML and config files as text:
   - `tests/pages.test.js` checks that every page is in sync with `sync:pages` and has the element IDs
     `app.js` needs. It also checks canonical and Open Graph tags, that referenced assets exist, and that
     there is no inline script and no stray HTML file;
   - `tests/headers.test.js` pins the security headers.
3. **Browser tests** with Playwright:
   - `tests/e2e/smoke.spec.js` covers real user flows: manual entry on every platform, pasting on some (Kubernetes,
     Redis, Couchbase; the parsing itself is unit-tested for every format), the nav dropdown, disabling platforms,
     the copy button and theme persistence;
   - `tests/e2e/csp.spec.js` enforces the production CSP
     ([ADR 0009](0009-content-security-policy-without-inline-scripts.md)).

## Alternatives considered

- **Jest or Vitest.** Richer tooling, but `node:test` covers what is needed, needs no install, and runs native
  ES modules as they are.
- **Browser tests only.** They would catch everything eventually, but slowly, with less precise failures, and
  they need a browser installed to run anything at all.

## Consequences

- `npm test` runs in a few seconds on a fresh clone, with nothing installed.
- The structure tests make up for the missing build step: they turn "the pages must stay consistent" from a
  convention into a failing check.
- Browser tests need a Playwright browser. Locally, `PW_CHANNEL=msedge` or `PW_CHANNEL=chrome` reuses an
  installed one.
- Third parties are stubbed in the browser tests. Their stubs mimic the observed behaviour of the real
  scripts, so a change on their side can still go unnoticed until production.
