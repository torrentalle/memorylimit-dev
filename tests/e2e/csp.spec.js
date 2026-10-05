// Enforces the Content-Security-Policy from public/_headers in the browser.
// `serve` (the local/CI web server) ignores _headers, so the policy is added
// to every HTML response here; any violation fails the test.
import { test, expect } from './fixtures.js';
import { sitewideCsp } from '../helpers/headers.js';
import { PLATFORM_DEFINITIONS, getGuidePages, SIZING_MODEL_GUIDE } from '../../public/js/platforms.js';

// upgrade-insecure-requests would rewrite the http://localhost test server's
// own asset URLs to https; it only matters on the real (https) origin.
const POLICY = sitewideCsp()
  .split(';')
  .map((directive) => directive.trim())
  .filter((directive) => directive && directive !== 'upgrade-insecure-requests')
  .join('; ');

const PAGES = [
  '/',
  '/privacy/',
  '/support/',
  SIZING_MODEL_GUIDE,
  ...PLATFORM_DEFINITIONS.map((def) => def.path),
  ...getGuidePages().map((guide) => guide.path)
];

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
  await patch('**/js/analytics.js', 'cloudflareBeaconToken: PLACEHOLDER_TOKEN', "cloudflareBeaconToken: 'csp-test'");
  // ./env.js keeps analytics silent off the production host; the test
  // server runs on localhost, so this test stands in for that host.
  await patch('**/js/env.js', 'return hostname === PRODUCTION_HOST;', 'return true;');

  const js = (body) => (route) => route.fulfill({ contentType: 'text/javascript', body });
  await page.route('https://static.cloudflareinsights.com/beacon.min.js', js(BEACON_STUB));
  await page.route('https://cloudflareinsights.com/**', (route) => route.fulfill({ status: 204 }));
}

const violations = (page) => page.evaluate(() => window.__cspViolations);

test.beforeEach(async ({ page }) => {
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
    const platform = PLATFORM_DEFINITIONS.find((def) => def.path === path);
    if (platform?.entry) {
      // A platform with its own page script has its own inputs (Couchbase: a bucket list, not average/peak).
      await page.getByRole('spinbutton', { name: /^Documents/ }).fill('2000000');
      await expect(page.locator('#snippet-code')).toContainText('--bucket-ramsize');
    } else if (platform) {
      await page.getByRole('spinbutton', { name: /^Average usage/ }).fill('400');
      await page.getByRole('spinbutton', { name: /^Peak usage/ }).fill('600');
      await expect(page.locator('#snippet-code')).not.toBeEmpty();
    }
    expect(await violations(page)).toEqual([]);
  });
}

test('Cloudflare Web Analytics, once configured, runs under the CSP', async ({ page }) => {
  await configureThirdParties(page);
  await page.goto('/kubernetes/');
  await expect
    .poll(() => page.evaluate(() => (window.__thirdParty ?? []).toSorted()))
    .toEqual(['cloudflare-beacon']);
  expect(await violations(page)).toEqual([]);
});

// Real analytics only ever run on the production host, so any other
// host the site might be served from never pollutes real
// analytics, even once a real token is configured.
test('off the production host, Cloudflare Analytics stays dormant even when configured', async ({ page }) => {
  // The control: the token really was configured, so "no requests" is down to the host check, not a patch
  // that no longer matches analytics.js.
  let tokenConfigured = false;
  await page.route('**/js/analytics.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace('cloudflareBeaconToken: PLACEHOLDER_TOKEN', "cloudflareBeaconToken: 'csp-test'");
    tokenConfigured = body !== source;
    await route.fulfill({ response, body });
  });
  const thirdPartyRequests = [];
  page.on('request', (req) => {
    if (/cloudflareinsights\.com/.test(req.url())) thirdPartyRequests.push(req.url());
  });
  await page.goto('/kubernetes/'); // served from localhost in this test run — never the production host
  await page.waitForLoadState('networkidle');
  expect(tokenConfigured).toBe(true);
  expect(thirdPartyRequests).toEqual([]);
});

test('/k8s/ redirects to /kubernetes/ under the CSP without violations', async ({ page }) => {
  await page.goto('/k8s/');
  await page.waitForURL('**/kubernetes/');
  await page.waitForFunction(() => 'calculatorReady' in document.documentElement.dataset);
  expect(await violations(page)).toEqual([]);
});
