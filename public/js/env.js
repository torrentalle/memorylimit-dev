/**
 * The one hostname third-party scripts (ads, analytics) are allowed to run
 * on. Everything else — a Cloudflare Pages PR preview, the dev subdomain,
 * `npm run dev` on localhost — stays silent even when a real ID is
 * configured in ./monetization.js or ./analytics.js, so testing never
 * pollutes real analytics or serves real ads. See ADR 0012.
 */
export const PRODUCTION_HOST = 'memorylimit.dev';

/**
 * @param {string} [hostname] - defaults to the current page's host; outside
 *   a browser (Node tests) there is no `location`, so it defaults to
 *   undefined, which is never the production host.
 */
export function isProductionHost(hostname = (typeof location === 'undefined' ? undefined : location.hostname)) {
  return hostname === PRODUCTION_HOST;
}
