import test from 'node:test';
import assert from 'node:assert/strict';
import * as Monetization from '../public/js/monetization.js';
import { PRODUCTION_HOST } from '../public/js/env.js';

function withConfig(overrides, fn) {
  const previous = { ...Monetization.MONETIZATION };
  Object.assign(Monetization.MONETIZATION, overrides);
  try {
    fn();
  } finally {
    Object.assign(Monetization.MONETIZATION, previous);
  }
}

const CONFIGURED = {
  ethicalAdsPublisherId: 'memorylimit',
  donationUrl: 'https://github.com/sponsors/example'
};

test('nothing renders while the shipped placeholders are still in place', () => {
  assert.equal(Monetization.getEthicalAdsConfig(PRODUCTION_HOST), null);
  assert.equal(Monetization.getDonationConfig(), null);
});

test('getEthicalAdsConfig returns the publisher id once it is configured, on the production host', () => {
  withConfig(CONFIGURED, () => {
    assert.equal(Monetization.getEthicalAdsConfig(PRODUCTION_HOST).publisherId, 'memorylimit');
  });
});

test('getEthicalAdsConfig returns null when disabled, even when configured', () => {
  withConfig({ ...CONFIGURED, ethicalAds: false }, () => {
    assert.equal(Monetization.getEthicalAdsConfig(PRODUCTION_HOST), null);
  });
});

test('getEthicalAdsConfig stays silent off the production host, even fully configured — no real ad or tracking pixel outside production', () => {
  withConfig(CONFIGURED, () => {
    for (const hostname of ['dev.memorylimit.dev', 'localhost', 'some-branch.memorylimit-dev.pages.dev', undefined]) {
      assert.equal(Monetization.getEthicalAdsConfig(hostname), null, hostname);
    }
  });
});

test('getDonationConfig resolves label/icon from the configured provider', () => {
  withConfig(CONFIGURED, () => {
    assert.deepEqual(Monetization.getDonationConfig(), {
      provider: 'github-sponsors',
      label: 'Sponsor on GitHub',
      icon: '♥',
      url: 'https://github.com/sponsors/example'
    });
  });
});

test('getDonationConfig switches label/icon when the provider changes', () => {
  withConfig({ ...CONFIGURED, donationProvider: 'buy-me-a-coffee' }, () => {
    assert.equal(Monetization.getDonationConfig().label, 'Buy me a coffee');
  });
});

test('getDonationConfig rejects URLs that are not absolute https', () => {
  for (const donationUrl of ['github.com/sponsors/example', 'http://example.com', 'javascript:alert(1)', '']) {
    withConfig({ donationUrl }, () => {
      assert.equal(Monetization.getDonationConfig(), null, donationUrl);
    });
  }
});

test('getDonationConfig returns null when disabled, even when configured', () => {
  withConfig({ ...CONFIGURED, donationLink: false }, () => {
    assert.equal(Monetization.getDonationConfig(), null);
  });
});
