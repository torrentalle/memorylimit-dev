/**
 * Config for Cloudflare Web Analytics. The beacon is injected by
 * ./site.js. It's cookieless and collects no personal data, so there is
 * intentionally no consent gating.
 */
import { isProductionHost } from './env.js';

export const PLACEHOLDER_TOKEN = 'REPLACE_WITH_ACTUAL_TOKEN';

export const ANALYTICS = {
  cloudflareWebAnalytics: true,
  // From the Cloudflare dashboard: Websites → your domain → Analytics →
  // Web Analytics (or the standalone Web Analytics product if the domain
  // isn't proxied through Cloudflare). Nothing is sent while this is
  // still the placeholder.
  cloudflareBeaconToken: PLACEHOLDER_TOKEN
};

/** @param {string} [hostname] - see ./env.js; the beacon only ever reports from the production host. */
export function getCloudflareAnalyticsConfig(hostname) {
  const { cloudflareWebAnalytics, cloudflareBeaconToken } = ANALYTICS;
  if (!cloudflareWebAnalytics || !cloudflareBeaconToken || cloudflareBeaconToken === PLACEHOLDER_TOKEN || !isProductionHost(hostname)) return null;
  return { token: cloudflareBeaconToken };
}
