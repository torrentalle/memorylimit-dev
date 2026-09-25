/**
 * Shared chrome for every page: theme toggle, nav, analytics beacon and
 * footer monetization. Import this once from each page.
 */
import { initThemeToggle } from './theme.js';
import { initNav } from './nav.js';
import { renderMonetization } from './monetization-ui.js';
import { getCloudflareAnalyticsConfig } from './analytics.js';

function injectAnalyticsBeacon() {
  const config = getCloudflareAnalyticsConfig();
  if (!config || document.querySelector('script[data-cf-beacon]')) return;

  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.dataset.cfBeacon = JSON.stringify({ token: config.token });
  document.head.append(script);
}

initThemeToggle();
initNav();
renderMonetization();
injectAnalyticsBeacon();
