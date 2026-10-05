/**
 * Fills the footer's #donation-slot from ./monetization.js. The slot is
 * removed outright when the link is off (or unconfigured) so it leaves no
 * gap in the footer layout.
 */
import { getDonationConfig } from './monetization.js';

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
  renderDonationLink();
}
