# 9. Content-Security-Policy with no inline scripts

- **Status:** Superseded by [0015](0015-remove-ethicalads-single-third-party-csp.md)
- **Date:** 2026-09-25

## Context

The site renders user-pasted text and loads two optional third-party scripts
([ADR 0008](0008-cookieless-analytics-and-non-tracking-ads.md)). `app.js` only writes user input through
`textContent`, never as HTML. A Content-Security-Policy is the second line of defence if that ever slips, or
if a third party is compromised. A CSP that allows `'unsafe-inline'` scripts gives little protection against
XSS, and the pages originally had inline scripts: the theme bootstrap and each page's module entry.

## Decision

- **No inline JavaScript anywhere:**
  - the pre-paint theme bootstrap is an external blocking script, `theme-init.js`, in `<head>`;
  - calculator pages use a shared external entry point ([ADR 0006](0006-load-only-the-current-platforms-formatter.md));
  - there are no inline event handlers and no `javascript:` URLs.
- **The policy:** `public/_headers` sends a CSP with:
  - `default-src 'self'`;
  - `script-src` limited to `'self'`, the two EthicalAds hosts and the Cloudflare beacon host. There is no
    `'unsafe-inline'` and no `'unsafe-eval'`;
  - `connect-src` adding only the analytics endpoint;
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'`;
  - `upgrade-insecure-requests`.
- **Other headers:** `X-Content-Type-Options: nosniff`, a `strict-origin-when-cross-origin` Referrer-Policy,
  and a Permissions-Policy that turns off the camera, microphone, geolocation, payment and USB APIs.
- **The one inline exception:** `style-src` allows `'unsafe-inline'`, because the EthicalAds client injects a
  `<style>` element and offers no way to pass a nonce. None of the site's own CSS is inline.
- **Where the hosts come from:** the third-party hosts were taken from what the EthicalAds client and the
  Cloudflare beacon actually load, not from guesses. EthicalAds loads its client, a JSONP ad decision, an
  ad-block probe and a view pixel. The Cloudflare beacon loads its script and posts reports.

## Alternatives considered

- **Nonces or hashes for the inline scripts.** Nonces need a server to generate one per response, and this is
  a static site. Hashes would break on every edit of an inline script. Removing inline scripts is simpler and
  stricter.
- **A `<meta http-equiv>` CSP.** It needs no host support, but it can't set `frame-ancestors` and doesn't
  cover the other headers.
- **No CSP.** Acceptable for a site with no accounts, but it leaves nothing to contain a third-party
  compromise.

## Consequences

- An injected inline script is refused by the browser, even if output escaping ever fails.
- New third parties need their hosts added to `_headers` and to `tests/headers.test.js`, or they are blocked.
- The policy is only served by Cloudflare Pages ([ADR 0007](0007-host-on-cloudflare-pages.md)), so
  `tests/e2e/csp.spec.js` injects it into every HTML response in tests. It fails on any `securitypolicyviolation`,
  on every page and with both third parties switched on (stubbed to behave like the real scripts).
- `'unsafe-inline'` in `style-src` stays until EthicalAds supports nonces, or the ad integration changes.

## Update

The EthicalAds integration was removed before it was ever enabled (kept on the `feat/ethicalads` branch). The policy now has the Cloudflare beacon as its only third party, and `style-src` is `'self'` with no `'unsafe-inline'`. The text above describes the original design. See [ADR 0015](0015-remove-ethicalads-single-third-party-csp.md), which supersedes this record.
