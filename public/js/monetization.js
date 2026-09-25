/**
 * Config for the two passive monetization elements (an EthicalAds text ad
 * and a donation link). ./monetization-ui.js renders them.
 */

const PLACEHOLDER_PREFIX = 'REPLACE_WITH_';

export const MONETIZATION = {
  ethicalAds: true,
  // EthicalAds requires a one-time manual application at
  // https://www.ethicalads.io/. Nothing renders (and no third-party script
  // loads) while this is still a placeholder.
  ethicalAdsPublisherId: 'REPLACE_WITH_ETHICALADS_PUBLISHER_ID',

  donationLink: true,
  donationProvider: 'github-sponsors', // 'github-sponsors' | 'buy-me-a-coffee'
  // Must be an absolute https:// URL; the link stays hidden until it is.
  donationUrl: 'REPLACE_WITH_ACTUAL_URL'
};

export const DONATION_PROVIDERS = {
  'github-sponsors': { label: 'Sponsor on GitHub', icon: '♥' },
  'buy-me-a-coffee': { label: 'Buy me a coffee', icon: '☕' }
};

function isConfigured(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith(PLACEHOLDER_PREFIX);
}

export function getEthicalAdsConfig() {
  if (!MONETIZATION.ethicalAds || !isConfigured(MONETIZATION.ethicalAdsPublisherId)) return null;
  return { publisherId: MONETIZATION.ethicalAdsPublisherId };
}

export function getDonationConfig() {
  const { donationLink, donationUrl, donationProvider } = MONETIZATION;
  if (!donationLink || !isConfigured(donationUrl) || !/^https:\/\/\S+$/.test(donationUrl)) return null;
  const meta = DONATION_PROVIDERS[donationProvider] ?? DONATION_PROVIDERS['github-sponsors'];
  return { provider: donationProvider, label: meta.label, icon: meta.icon, url: donationUrl };
}
