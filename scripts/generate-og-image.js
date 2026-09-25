#!/usr/bin/env node
/**
 * Renders og-image-source.html to public/og-image.png (1200×630) with
 * headless Chromium via Playwright, then updates og-image.stamp.json.
 *
 *   npx playwright install chromium   # once
 *   npm run generate-og-image
 *
 * Set PW_CHANNEL=msedge (or chrome) to use an installed browser instead of
 * downloading Playwright's Chromium. Run it whenever og-image-source.html or
 * its fonts change, and commit the PNG and the stamp together:
 * tests/og-image.test.js fails until you do.
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SOURCE_PATH, IMAGE_PATH, writeStamp } from './og-image-stamp.js';

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
  await page.screenshot({ path: IMAGE_PATH, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
} finally {
  await browser.close();
}

writeStamp();
console.log(`generate-og-image: wrote ${IMAGE_PATH} (${WIDTH}×${HEIGHT}) and og-image.stamp.json`);
