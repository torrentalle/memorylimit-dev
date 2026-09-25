/**
 * The header nav is a static <details> dropdown (it works without
 * JavaScript and is crawlable). This removes links to platforms disabled in
 * ./platforms.js and closes the menu on an outside click or Escape.
 */
import { isEnabled } from './platforms.js';

export function initNav() {
  for (const link of document.querySelectorAll('[data-platform-link]')) {
    if (!isEnabled(link.dataset.platformLink)) (link.closest('li') ?? link).remove();
  }

  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  if (!nav.querySelector('a')) {
    nav.remove();
    return;
  }

  const menu = nav.querySelector('details');
  if (!menu) return;
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}
