/**
 * Config for Cloudflare Web Analytics. The beacon is injected by
 * ./site.js. It's cookieless and collects no personal data, so there is
 * intentionally no consent gating.
 */

export const PLACEHOLDER_TOKEN = 'REPLACE_WITH_ACTUAL_TOKEN';

export const ANALYTICS = {
  cloudflareWebAnalytics: true,
  // From the Cloudflare dashboard: Websites → your domain → Analytics →
  // Web Analytics (or the standalone Web Analytics product if the domain
  // isn't proxied through Cloudflare). Nothing is sent while this is
  // still the placeholder.
  cloudflareBeaconToken: PLACEHOLDER_TOKEN
};

export function getCloudflareAnalyticsConfig() {
  const { cloudflareWebAnalytics, cloudflareBeaconToken } = ANALYTICS;
  if (!cloudflareWebAnalytics || !cloudflareBeaconToken || cloudflareBeaconToken === PLACEHOLDER_TOKEN) return null;
  return { token: cloudflareBeaconToken };
}
