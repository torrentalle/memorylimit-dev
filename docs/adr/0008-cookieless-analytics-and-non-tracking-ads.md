# 8. Cookieless analytics and non-tracking ads, dormant until configured

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The project wants basic traffic numbers and a way to cover its costs. Typical analytics and ad networks set
cookies and track visitors across sites. Under the GDPR and the ePrivacy Directive, that requires a consent
banner. A consent banner in front of a small developer tool is friction. It would also contradict the privacy
stance of [ADR 0002](0002-static-client-side-site-without-build-step.md).

## Decision

- **Analytics:** Cloudflare Web Analytics. It is cookieless and stores no personal data, so there is
  intentionally no consent UI and no consent-management code.
- **Ads:** EthicalAds, text placement only. Ads are chosen by page context, not by tracking the visitor.
- **Donations:** a plain link to GitHub Sponsors or Buy Me a Coffee.
- **Configuration:** each lives in its own config module (`analytics.js`, `monetization.js`) and renders only
  when it is switched on **and** given a real ID or URL. The shipped placeholders (`REPLACE_WITH_…`) render
  nothing and load no third-party script.
- **Privacy page:** `/privacy/` states what is and isn't collected.

## Alternatives considered

- **Google Analytics or AdSense.** More data and possibly more revenue, but both set cookies, so they need a
  consent banner.
- **Self-hosted analytics such as Plausible or Umami.** Also cookieless, but a server to run and pay for
  contradicts the no-backend decision.
- **No analytics or monetization at all.** The simplest option, but it gives no signal about which platforms
  people use.

## Consequences

- No cookies and no consent banner. The privacy page can make short, verifiable claims.
- A fork, preview or local run makes no third-party requests until someone configures IDs.
- The analytics are coarse: page views and Core Web Vitals, no events or funnels.
- The third-party hosts both services need are allowed in the CSP ahead of time
  ([ADR 0009](0009-content-security-policy-without-inline-scripts.md)), so switching them on needs no header
  change.
