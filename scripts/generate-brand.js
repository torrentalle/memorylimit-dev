#!/usr/bin/env node
/**
 * Writes the brand assets from scripts/brand/logo.js:
 *
 *   public/brand/*.svg        logo and monogram, in each colour variant
 *   public/favicon.svg        simplified monogram, follows light/dark scheme
 *   public/favicon.ico        16, 32 and 48 px PNGs (for browsers without SVG favicons)
 *   public/apple-touch-icon.png  180 px, opaque
 *
 * The SVGs need nothing installed; the raster icons are rendered with
 * Playwright (PW_CHANNEL=msedge or chrome reuses an installed browser).
 * tests/brand.test.js fails if the committed SVGs drift from logo.js.
 *
 *   npm run generate:brand
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_SVGS, faviconSvg } from './brand/logo.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const BRAND_DIR = join(PUBLIC, 'brand');

mkdirSync(BRAND_DIR, { recursive: true });
for (const [name, build] of Object.entries(BRAND_SVGS)) writeFileSync(join(BRAND_DIR, name), build());
writeFileSync(join(PUBLIC, 'favicon.svg'), faviconSvg());

/** An ICO file holding PNG images (supported by every browser since IE Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  const page = await browser.newPage({ colorScheme: 'light' });
  const svg = `data:image/svg+xml;base64,${Buffer.from(faviconSvg()).toString('base64')}`;
  const render = async (size, { background = 'transparent', inset = 0 } = {}) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:${background}"><img src="${svg}" style="display:block;margin:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px"></body>`);
    await page.locator('img').evaluate((img) => img.decode());
    return page.screenshot({ omitBackground: background === 'transparent', clip: { x: 0, y: 0, width: size, height: size } });
  };
  const pngs = [];
  for (const size of [16, 32, 48]) pngs.push({ size, data: await render(size) });
  writeFileSync(join(PUBLIC, 'favicon.ico'), ico(pngs));
  // iOS fills transparency with black, so the touch icon gets a white tile.
  writeFileSync(join(PUBLIC, 'apple-touch-icon.png'), await render(180, { background: '#ffffff', inset: 22 }));
} finally {
  await browser.close();
}

console.log(`generate-brand: wrote ${Object.keys(BRAND_SVGS).length} SVGs to public/brand/, favicon.svg, favicon.ico and apple-touch-icon.png`);
