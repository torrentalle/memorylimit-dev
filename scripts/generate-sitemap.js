#!/usr/bin/env node
/**
 * Regenerates public/sitemap.xml from public/js/platforms.js, so it can't
 * drift from ENABLED_PLATFORMS. Run after turning a platform on or off:
 *
 *   npm run generate:sitemap
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnabledPlatforms, SIZING_MODEL_GUIDE } from '../public/js/platforms.js';

export const BASE_URL = 'https://memorylimit.dev';
// Always-present pages. /k8s/ is a redirect, not a canonical page.
const ALWAYS_INCLUDED_PATHS = ['/', '/privacy/', '/support/', SIZING_MODEL_GUIDE];

export function sitemapPaths(platforms = getEnabledPlatforms()) {
  return [...ALWAYS_INCLUDED_PATHS, ...platforms.flatMap((def) => (def.guide ? [def.path, def.guide] : [def.path]))];
}

export function buildSitemapXml(paths = sitemapPaths()) {
  const body = paths.map((path) => `  <url><loc>${BASE_URL}${path}</loc></url>`).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = sitemapPaths();
  const outPath = join(import.meta.dirname, '..', 'public', 'sitemap.xml');
  writeFileSync(outPath, buildSitemapXml(paths));
  console.log(`Wrote ${outPath}:\n${paths.map((p) => `  ${p}`).join('\n')}`);
}
