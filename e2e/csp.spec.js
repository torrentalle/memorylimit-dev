// Enforces the Content-Security-Policy from public/_headers in the browser.
// `serve` (the local/CI web server) ignores _headers, so the policy is added
// to every HTML response here; any violation fails the test.
import { test, expect } from './fixtures.js';
import { sitewideCsp } from '../tests/helpers/headers.js';
import { PLATFORM_DEFINITIONS } from '../public/js/platforms.js';

// upgrade-insecure-requests would rewrite the http://localhost test server's
// own asset URLs to https; it only matters on the real (https) origin.
const POLICY = sitewideCsp()
  .split(';')
  .map((directive) => directive.trim())
  .filter((directive) => directive && directive !== 'upgrade-insecure-requests')
  .join('; ');

const PAGES = ['/', '/privacy/', ...PLATFORM_DEFINITIONS.map((def) => def.path)];

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Mimics what the real EthicalAds client does (read from ethicalads.min.js):
// injects a <style>, requests the ad decision as a JSONP <script> from
// server.ethicalads.io, probes for ad blockers with an image from
// media.ethicalads.io and records the view with an image from server.ethicalads.io.
const ETHICALADS_STUB = `
  const style = document.createElement('style');
  style.textContent = '.ea-text { outline: 0; }';
  document.head.append(style);

  const loaded = (what) => () => { (window.__thirdParty ??= []).push(what); };
  window.__eaDecision = loaded('ethicalads-decision');
  const decision = document.createElement('script');
  decision.src = 'https://server.ethicalads.io/api/v1/decision/?callback=__eaDecision';
  document.head.append(decision);

  for (const [what, src] of [
    ['ethicalads-probe', 'https://media.ethicalads.io/abp/px.gif'],
    ['ethicalads-view', 'https://server.ethicalads.io/proxy/view/csp-test/']
  ]) {
    const img = new Image();
    img.onload = loaded(what);
    img.src = src;
  }
`;

// Mimics the Cloudflare beacon: reports to cloudflareinsights.com.
const BEACON_STUB = `
  fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST', mode: 'no-cors', body: '{}' })
    .then(() => { (window.__thirdParty ??= []).push('cloudflare-beacon'); });
`;

async function enforceCsp(page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}`);
    });
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': POLICY } });
  });
}

async function configureThirdParties(page) {
  const patch = (pattern, from, to) =>
    page.route(pattern, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(from, to);
      await route.fulfill({ response, body });
    });
  await patch('**/js/monetization.js', 'REPLACE_WITH_ETHICALADS_PUBLISHER_ID', 'csp-test');
  await patch('**/js/analytics.js', 'cloudflareBeaconToken: PLACEHOLDER_TOKEN', "cloudflareBeaconToken: 'csp-test'");

  const js = (body) => (route) => route.fulfill({ contentType: 'text/javascript', body });
  await page.route('https://media.ethicalads.io/media/client/ethicalads.min.js', js(ETHICALADS_STUB));
  await page.route('https://server.ethicalads.io/api/v1/decision/**', js('__eaDecision();'));
  await page.route(/^https:\/\/(media|server)\.ethicalads\.io\/(abp|proxy)\//, (route) =>
    route.fulfill({ contentType: 'image/gif', body: GIF })
  );
  await page.route('https://static.cloudflareinsights.com/beacon.min.js', js(BEACON_STUB));
  await page.route('https://cloudflareinsights.com/**', (route) => route.fulfill({ status: 204 }));
}

const violations = (page) => page.evaluate(() => window.__cspViolations);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await enforceCsp(page);
});

test('the harness really enforces the policy', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__inlineRan = true;';
    document.head.append(script);
  });
  await expect.poll(() => violations(page)).toContainEqual(expect.stringMatching(/^script-src-elem blocked inline/));
  expect(await page.evaluate(() => window.__inlineRan)).toBeUndefined();
});

for (const path of PAGES) {
  test(`${path} works under the CSP without violations`, async ({ page }) => {
    await page.goto(path);
    await page.locator('.theme-toggle').click();
    if (path.length > 1 && path !== '/privacy/') {
      await page.getByRole('spinbutton', { name: /^Average usage/ }).fill('400');
      await page.getByRole('spinbutton', { name: /^Peak usage/ }).fill('600');
      await expect(page.locator('#snippet-code')).not.toBeEmpty();
    }
    expect(await violations(page)).toEqual([]);
  });
}

test('EthicalAds and Cloudflare Web Analytics, once configured, run under the CSP', async ({ page }) => {
  await configureThirdParties(page);
  await page.goto('/kubernetes/');
  await expect
    .poll(() => page.evaluate(() => (window.__thirdParty ?? []).toSorted()))
    .toEqual(['cloudflare-beacon', 'ethicalads-decision', 'ethicalads-probe', 'ethicalads-view']);
  expect(await violations(page)).toEqual([]);
});
