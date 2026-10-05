import test from 'node:test';
import assert from 'node:assert/strict';
import * as Monetization from '../public/js/monetization.js';

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
  donationUrl: 'https://github.com/sponsors/example'
};

test('the shipped donation link points at the project GitHub Sponsors page', () => {
  assert.equal(Monetization.getDonationConfig().url, 'https://github.com/sponsors/torrentalle');
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
