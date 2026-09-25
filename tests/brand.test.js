// The brand assets are generated from scripts/brand/logo.js and committed.
// These tests keep the committed files in step with the generator and check
// the raster icons' formats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_SVGS, faviconSvg } from '../scripts/brand/logo.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const read = (...path) => readFileSync(join(PUBLIC, ...path));
const HOW_TO_FIX = 'run `npm run generate:brand`';

for (const [name, build] of Object.entries(BRAND_SVGS)) {
  test(`public/brand/${name} matches scripts/brand/logo.js`, () => {
    assert.equal(read('brand', name).toString(), build(), HOW_TO_FIX);
  });
}

test('public/favicon.svg matches scripts/brand/logo.js', () => {
  assert.equal(read('favicon.svg').toString(), faviconSvg(), HOW_TO_FIX);
});

test('the favicon follows the browser colour scheme', () => {
  assert.match(faviconSvg(), /@media \(prefers-color-scheme:dark\)/);
});

const pngSize = (png) => {
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

test('favicon.ico holds 16, 32 and 48 px PNG images', () => {
  const ico = read('favicon.ico');
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1]);
  const sizes = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const e = 6 + 16 * i;
    const png = ico.subarray(ico.readUInt32LE(e + 12), ico.readUInt32LE(e + 12) + ico.readUInt32LE(e + 8));
    const [w, h] = pngSize(png);
    assert.equal(w, h);
    assert.equal(ico.readUInt8(e), w);
    sizes.push(w);
  }
  assert.deepEqual(sizes, [16, 32, 48]);
});

test('apple-touch-icon.png is a 180×180 PNG', () => {
  assert.deepEqual(pngSize(read('apple-touch-icon.png')), [180, 180]);
});
