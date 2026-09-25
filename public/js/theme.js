/**
 * Light/dark toggle. The stored choice is applied before first paint by a
 * small inline script in each page's <head> (so there's no flash of the
 * wrong theme); this module only handles the button.
 */

export const THEME_KEY = 'memorylimit-theme';

function effectiveTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function initThemeToggle() {
  const button = document.getElementById('theme-toggle');
  if (!button) return;

  const sync = () => button.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
  sync();

  button.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
    sync();
  });
}
