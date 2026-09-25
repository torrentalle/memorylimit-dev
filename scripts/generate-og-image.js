#!/usr/bin/env node
/**
 * Renders og-image-source.html to public/og-image.png (1200×630) with
 * headless Chromium via Playwright.
 *
 *   npx playwright install chromium   # once
 *   npm run generate-og-image
 *
 * Set PW_CHANNEL=msedge (or chrome) to use an installed browser instead of
 * downloading Playwright's Chromium. CI runs this automatically via
 * .github/workflows/og-image.yml.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const SOURCE_PATH = join(ROOT, 'og-image-source.html');
const OUTPUT_PATH = join(ROOT, 'public', 'og-image.png');
const WIDTH = 1200;
const HEIGHT = 630;

if (!existsSync(SOURCE_PATH)) {
  console.error(`generate-og-image: ${SOURCE_PATH} does not exist — nothing to render.`);
  process.exit(1);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(pathToFileURL(SOURCE_PATH).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUTPUT_PATH, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
} finally {
  await browser.close();
}

console.log(`generate-og-image: wrote ${OUTPUT_PATH} (${WIDTH}×${HEIGHT})`);
