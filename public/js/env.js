/**
 * The one hostname third-party scripts (analytics) are allowed to run
 * on. Every other hostname — a Cloudflare Pages preview, `npm run dev` on
 * localhost, anywhere else the site might be served from — stays silent
 * even when a real ID is configured in ./analytics.js,
 * so testing never pollutes real analytics.
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
