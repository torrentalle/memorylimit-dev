/**
 * Fills the footer's #ethical-ads-slot and #donation-slot from
 * ./monetization.js. A slot whose element is off (or unconfigured) is
 * removed outright so it leaves no gap in the footer layout.
 */
import { getEthicalAdsConfig, getDonationConfig } from './monetization.js';

function renderEthicalAds() {
  const slot = document.getElementById('ethical-ads-slot');
  if (!slot) return;

  const config = getEthicalAdsConfig();
  if (!config) {
    slot.remove();
    return;
  }

  // EthicalAds' "text" placement: their least intrusive format.
  const adUnit = document.createElement('div');
  adUnit.className = 'ea-text';
  adUnit.dataset.eaPublisher = config.publisherId;
  adUnit.dataset.eaType = 'text';

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://media.ethicalads.io/media/client/ethicalads.min.js';

  slot.append(adUnit, script);
}

function renderDonationLink() {
  const slot = document.getElementById('donation-slot');
  if (!slot) return;

  const config = getDonationConfig();
  if (!config) {
    slot.remove();
    return;
  }

  const link = document.createElement('a');
  link.className = 'donation-link';
  link.href = config.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const icon = document.createElement('span');
  icon.className = 'donation-link__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = config.icon;

  link.append(icon, ` ${config.label}`);
  slot.append(link);
}

export function renderMonetization() {
  renderEthicalAds();
  renderDonationLink();
}
