// public/og-image.png is rendered by hand (npm run generate-og-image) and
// committed; nothing regenerates it automatically. These tests fail when it
// is stale, so a pull request that changes the share image's source can't be
// merged without the re-rendered PNG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, IMAGE_PATH, STAMP_PATH, referencedFiles, inputsHash, imageHash, readStamp } from '../scripts/og-image-stamp.js';

const HOW_TO_FIX = 'run `npm run generate-og-image` and commit public/og-image.png with og-image.stamp.json';
const stamp = existsSync(STAMP_PATH) ? readStamp() : {};

test('og-image.stamp.json exists', () => {
  assert.ok(existsSync(STAMP_PATH), `og-image.stamp.json is missing: ${HOW_TO_FIX}`);
});

test('og-image-source.html only references files that exist', () => {
  const files = referencedFiles();
  assert.ok(files.some((path) => path.endsWith('.woff2')));
  assert.deepEqual(files.filter((path) => !existsSync(join(ROOT, path))), []);
});

test('og-image.png was rendered from the current og-image-source.html and the files it uses', () => {
  assert.equal(stamp.inputs, inputsHash(), `the share image's source changed since it was rendered: ${HOW_TO_FIX}`);
});

test('og-image.png is the file the generator wrote, not a hand-edited replacement', () => {
  assert.equal(stamp.image, imageHash(), `public/og-image.png doesn't match its stamp: ${HOW_TO_FIX}`);
});

test('og-image.png is a 1200×630 PNG', () => {
  const png = readFileSync(IMAGE_PATH);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});
