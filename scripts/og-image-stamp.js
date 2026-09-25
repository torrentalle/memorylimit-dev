/**
 * Records what public/og-image.png was rendered from, so a test can tell when
 * the image is stale. The stamp holds two SHA-256 hashes:
 *
 * - `inputs`: og-image-source.html plus every font file it references;
 * - `image`: the PNG that `npm run generate-og-image` wrote from them.
 *
 * tests/og-image.test.js fails when either no longer matches: the source or a
 * font changed without re-rendering, or the PNG was replaced by hand.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..');
export const SOURCE_PATH = join(ROOT, 'og-image-source.html');
export const IMAGE_PATH = join(ROOT, 'public', 'og-image.png');
export const STAMP_PATH = join(ROOT, 'og-image.stamp.json');

const sha256 = (...buffers) => {
  const hash = createHash('sha256');
  for (const buffer of buffers) hash.update(buffer);
  return hash.digest('hex');
};

/** Repo-relative paths of the fonts og-image-source.html loads, sorted. */
export function referencedFonts(html = readFileSync(SOURCE_PATH, 'utf8')) {
  return [...new Set([...html.matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1]))].sort();
}

export function inputsHash() {
  // Line endings are normalised so a CRLF checkout hashes like an LF one.
  const html = readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n');
  const fonts = referencedFonts(html).flatMap((path) => [path, readFileSync(join(ROOT, path))]);
  return sha256(html, ...fonts);
}

export const imageHash = () => sha256(readFileSync(IMAGE_PATH));

export function readStamp() {
  return JSON.parse(readFileSync(STAMP_PATH, 'utf8'));
}

export function writeStamp() {
  const stamp = { inputs: inputsHash(), image: imageHash() };
  writeFileSync(STAMP_PATH, `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}
