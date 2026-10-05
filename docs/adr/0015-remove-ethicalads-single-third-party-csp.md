# 15. Remove EthicalAds: cookieless analytics as the only third party, and no inline styles

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

[ADR 0008](0008-cookieless-analytics-and-non-tracking-ads.md) planned two dormant third parties: Cloudflare Web
Analytics and an EthicalAds text ad. [ADR 0009](0009-content-security-policy-without-inline-scripts.md) shaped
the Content-Security-Policy around both, including `'unsafe-inline'` in `style-src`, because the EthicalAds
client injects a `<style>` element without a nonce.

EthicalAds was never switched on: it needs a publisher ID, which needs a traffic minimum the site doesn't have.
Keeping it meant a weaker policy, its hosts in `script-src` and `img-src`, and code and tests for a feature that
never ran.

## Decision

- **No ads.** The EthicalAds slot, script, styles, configuration and tests are removed. The code is kept on the
  `feat/ethicalads` history in case it returns. The donation link (GitHub Sponsors) stays: it is a plain link
  and loads nothing.
- **Analytics stands as in ADR 0008.** Cloudflare Web Analytics, cookieless, dormant until a token is set, and
  only ever loaded on the production host.
- **CSP with one third party.** `script-src 'self' https://static.cloudflareinsights.com`, `connect-src 'self'
  https://cloudflareinsights.com`, `img-src 'self'` and `style-src 'self'`, with no `'unsafe-inline'`.
  Everything else in ADR 0009 stands: no inline scripts or `eval`, `frame-ancestors 'none'`, the policy pinned
  by `tests/headers.test.js` and enforced in the browser by `tests/e2e/csp.spec.js`.
- **The favicon is the one exception.** `/favicon.svg` takes its light and dark colours from an inline
  `<style>`, which `style-src 'self'` would block, so its rule in `public/_headers` drops the page policy with
  `! Content-Security-Policy`. It is a static file with no scripts. A test fails if any other SVG in `public/`
  gains a `<style>`.

## Alternatives considered

- **Keep EthicalAds dormant.** No visible change, but the weaker `style-src` and the extra hosts would stay for
  a feature with no date to ship.
- **Rewrite the favicon without `<style>`.** Presentation attributes can't follow `prefers-color-scheme`, so
  the favicon would lose its dark-mode colours.

## Consequences

- The policy is stricter than ADR 0009's: no inline styles anywhere except the favicon's own document.
- Bringing ads back means a new ADR, the hosts back in the policy, and, if the client still injects a
  `<style>`, `'unsafe-inline'` back in `style-src`.
- ADRs 0008 and 0009 are superseded by this record; their text describes the original design.
