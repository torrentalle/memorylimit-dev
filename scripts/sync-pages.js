#!/usr/bin/env node
/**
 * Rewrites the shared, platform-driven blocks of the static pages from
 * public/js/platforms.js, so adding a platform doesn't mean hand-editing
 * every page:
 *
 *   <!-- platform-nav:start --> … <!-- platform-nav:end -->      every page
 *   <!-- platform-cards:start --> … <!-- platform-cards:end -->  landing page
 *
 * Every defined platform is written out; links to disabled ones are removed
 * at runtime by js/nav.js and js/landing.js. tests/pages.test.js fails if a
 * page is out of sync.
 *
 *   npm run sync:pages
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_DEFINITIONS } from '../public/js/platforms.js';

export const PUBLIC_DIR = join(import.meta.dirname, '..', 'public');

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** Pages carrying the shared nav: [directory under public/, current platform id or null]. */
export function navPages() {
  return [
    ['', null],
    ['privacy', null],
    ...PLATFORM_DEFINITIONS.map((def) => [def.path.slice(1, -1), def.id])
  ];
}

export function renderNav(currentId, indent = '    ') {
  const current = PLATFORM_DEFINITIONS.find((def) => def.id === currentId);
  const summary = current
    ? `<span class="site-nav__hint">Calculator</span> ${escapeHtml(current.label)}`
    : 'Calculators';
  const items = PLATFORM_DEFINITIONS.map((def) => {
    const currentAttr = def.id === currentId ? ' aria-current="page"' : '';
    return (
      `      <li><a class="site-nav__link" href="${def.path}" data-platform-link="${def.id}"${currentAttr}>` +
      `${escapeHtml(def.label)}</a></li>`
    );
  });
  return [
    '<nav class="site-nav" aria-label="Calculators">',
    '  <details class="site-nav__menu">',
    `    <summary class="site-nav__toggle">${summary}</summary>`,
    '    <ul class="site-nav__list">',
    ...items,
    '    </ul>',
    '  </details>',
    '</nav>'
  ]
    .map((line) => indent + line)
    .join('\n');
}

export function renderCards(indent = '      ') {
  return PLATFORM_DEFINITIONS.map((def) =>
    [
      `<a class="platform-card" href="${def.path}" data-platform-card="${def.id}">`,
      `  <p class="platform-card__name">${escapeHtml(def.label)}</p>`,
      `  <p class="platform-card__desc">${escapeHtml(def.tagline)}</p>`,
      '  <p class="platform-card__cta">Open calculator →</p>',
      '</a>'
    ]
      .map((line) => indent + line)
      .join('\n')
  ).join('\n');
}

export function replaceBlock(html, name, content, file) {
  const pattern = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?\\n([ \\t]*)<!-- ${name}:end -->`);
  if (!pattern.test(html)) throw new Error(`${file}: missing <!-- ${name}:start --> / <!-- ${name}:end --> markers`);
  return html.replace(pattern, (_, endIndent) => `<!-- ${name}:start -->\n${content}\n${endIndent}<!-- ${name}:end -->`);
}

export function syncedPage(dir, currentId, html) {
  const file = join(dir || '.', 'index.html');
  let out = replaceBlock(html, 'platform-nav', renderNav(currentId), file);
  if (dir === '') out = replaceBlock(out, 'platform-cards', renderCards(), file);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [dir, currentId] of navPages()) {
    const path = join(PUBLIC_DIR, dir, 'index.html');
    if (!existsSync(path)) throw new Error(`Missing page for platform "${currentId}": ${path}`);
    const html = readFileSync(path, 'utf8');
    const updated = syncedPage(dir, currentId, html);
    if (updated !== html) {
      writeFileSync(path, updated);
      console.log(`updated public/${dir ? `${dir}/` : ''}index.html`);
    }
  }
}
