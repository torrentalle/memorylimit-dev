import test from 'node:test';
import assert from 'node:assert/strict';
import * as Analytics from '../public/js/analytics.js';
import { PRODUCTION_HOST } from '../public/js/env.js';

function withConfig(overrides, fn) {
  const previous = { ...Analytics.ANALYTICS };
  Object.assign(Analytics.ANALYTICS, overrides);
  try {
    fn();
  } finally {
    Object.assign(Analytics.ANALYTICS, previous);
  }
}

test('nothing is sent while the shipped placeholder token is in place', () => {
  assert.equal(Analytics.ANALYTICS.cloudflareWebAnalytics, true);
  assert.equal(Analytics.getCloudflareAnalyticsConfig(PRODUCTION_HOST), null);
});

test('returns the token once a real one is set, on the production host', () => {
  withConfig({ cloudflareBeaconToken: 'abc123realtoken' }, () => {
    assert.deepEqual(Analytics.getCloudflareAnalyticsConfig(PRODUCTION_HOST), { token: 'abc123realtoken' });
  });
});

test('returns null when disabled, even with a real token', () => {
  withConfig({ cloudflareBeaconToken: 'abc123realtoken', cloudflareWebAnalytics: false }, () => {
    assert.equal(Analytics.getCloudflareAnalyticsConfig(PRODUCTION_HOST), null);
  });
});

test('stays silent off the production host even when fully configured — previews and localhost never report real analytics', () => {
  withConfig({ cloudflareBeaconToken: 'abc123realtoken' }, () => {
    for (const hostname of ['staging.example.com', 'localhost', 'some-branch.example.pages.dev', undefined]) {
      assert.equal(Analytics.getCloudflareAnalyticsConfig(hostname), null, hostname);
    }
  });
});
