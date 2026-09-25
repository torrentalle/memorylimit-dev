import test from 'node:test';
import assert from 'node:assert/strict';
import * as Analytics from '../public/js/analytics.js';

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
  assert.equal(Analytics.getCloudflareAnalyticsConfig(), null);
});

test('returns the token once a real one is set', () => {
  withConfig({ cloudflareBeaconToken: 'abc123realtoken' }, () => {
    assert.deepEqual(Analytics.getCloudflareAnalyticsConfig(), { token: 'abc123realtoken' });
  });
});

test('returns null when disabled, even with a real token', () => {
  withConfig({ cloudflareBeaconToken: 'abc123realtoken', cloudflareWebAnalytics: false }, () => {
    assert.equal(Analytics.getCloudflareAnalyticsConfig(), null);
  });
});
