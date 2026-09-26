# Architecture Decision Records

Short records of the decisions that shaped MemoryLimit: what was decided, why, and what it costs. They use
[Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
(context, decision, consequences), plus the alternatives that were considered.

ADRs 0001–0010 were written on 2026-09-25, after the decisions they describe had been made and implemented.
From here on, add an ADR when you make the decision.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-static-client-side-site-without-build-step.md) | Static, client-side site with no build step | Accepted |
| [0003](0003-sizing-model-average-for-request-peak-for-limit.md) | Sizing model: average for the request, peak for the limit | Accepted |
| [0004](0004-pure-sizing-core-with-per-platform-formatters.md) | Pure sizing core with one formatter per platform | Accepted |
| [0005](0005-multi-page-static-html-with-generated-shared-blocks.md) | Multi-page static HTML with generated shared blocks | Accepted |
| [0006](0006-load-only-the-current-platforms-formatter.md) | Load only the current platform's formatter | Accepted |
| [0007](0007-host-on-cloudflare-pages.md) | Host on Cloudflare Pages | Accepted |
| [0008](0008-cookieless-analytics-and-non-tracking-ads.md) | Cookieless analytics and non-tracking ads, dormant until configured | Accepted |
| [0009](0009-content-security-policy-without-inline-scripts.md) | Content-Security-Policy with no inline scripts | Accepted |
| [0010](0010-testing-strategy.md) | Testing strategy | Accepted |
| [0011](0011-logo-as-generated-svg.md) | The logo as SVG generated from measured geometry | Accepted |
| [0012](0012-development-subdomain-via-separate-pages-project.md) | Development subdomain: a second Cloudflare Pages project, gated by Access | Accepted |

## Adding an ADR

1. Copy the shape of an existing record to `NNNN-short-title.md` with the next number.
2. Set its status to **Proposed**, then **Accepted** once it's implemented.
3. Never rewrite an accepted ADR to reverse it. Add a new one, and set the old one's status to
   **Superseded by** followed by a link to the new record.
4. Add it to the table above.
