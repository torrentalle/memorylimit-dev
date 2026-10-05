/**
 * Config for the passive monetization element (a donation link).
 * ./monetization-ui.js renders it.
 */
const PLACEHOLDER_PREFIX = 'REPLACE_WITH_';

export const MONETIZATION = {
  donationLink: true,
  donationProvider: 'github-sponsors', // 'github-sponsors' | 'buy-me-a-coffee'
  // Must be an absolute https:// URL; the link stays hidden until it is.
  donationUrl: 'https://github.com/sponsors/torrentalle'
};

export const DONATION_PROVIDERS = {
  'github-sponsors': { label: 'Sponsor on GitHub', icon: '♥' },
  'buy-me-a-coffee': { label: 'Buy me a coffee', icon: '☕' }
};

function isConfigured(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith(PLACEHOLDER_PREFIX);
}

export function getDonationConfig() {
  const { donationLink, donationUrl, donationProvider } = MONETIZATION;
  if (!donationLink || !isConfigured(donationUrl) || !/^https:\/\/\S+$/.test(donationUrl)) return null;
  const meta = DONATION_PROVIDERS[donationProvider] ?? DONATION_PROVIDERS['github-sponsors'];
  return { provider: donationProvider, label: meta.label, icon: meta.icon, url: donationUrl };
}
