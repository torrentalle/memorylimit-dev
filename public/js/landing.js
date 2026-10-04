/**
 * Landing page: the platform cards are static HTML; this removes cards for
 * disabled platforms and, if only one platform is enabled, skips the
 * landing page entirely.
 */
import { getEnabledPlatforms, isEnabled } from './platforms.js';

const enabled = getEnabledPlatforms();
if (enabled.length === 1) {
  window.location.replace(enabled[0].path);
}

for (const card of document.querySelectorAll('[data-platform-card]')) {
  if (!isEnabled(card.dataset.platformCard)) card.remove();
}

for (const group of document.querySelectorAll('.platform-group')) {
  if (!group.querySelector('[data-platform-card]')) group.remove();
}

const list = document.getElementById('platform-card-list');
if (list && !list.querySelector('[data-platform-card]')) {
  const empty = document.createElement('p');
  empty.className = 'platform-card-list__empty';
  empty.textContent = 'No calculators are enabled right now.';
  list.append(empty);
}
