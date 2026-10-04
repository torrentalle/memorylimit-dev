import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENABLED_PLATFORMS, PLATFORM_DEFINITIONS } from '../public/js/platforms.js';
import { buildSitemapXml, sitemapPaths } from '../scripts/generate-sitemap.js';

function withEnabled(overrides, fn) {
  const previous = { ...ENABLED_PLATFORMS };
  Object.assign(ENABLED_PLATFORMS, overrides);
  try {
    fn();
  } finally {
    Object.assign(ENABLED_PLATFORMS, previous);
  }
}

const PLATFORM_PATHS = PLATFORM_DEFINITIONS.map((def) => def.path);
const GUIDE_PATHS = PLATFORM_DEFINITIONS.filter((def) => def.guide).map((def) => def.guide);

test('lists the landing page, privacy and support pages, every enabled calculator and its guide', () => {
  const paths = sitemapPaths();
  assert.deepEqual(paths.filter((p) => !GUIDE_PATHS.includes(p)), ['/', '/privacy/', '/support/', ...PLATFORM_PATHS]);
  for (const guide of GUIDE_PATHS) assert.ok(paths.includes(guide), guide);
});

test('a guide follows its calculator in and out of the sitemap', () => {
  const couchbase = PLATFORM_DEFINITIONS.find((def) => def.guide);
  const paths = sitemapPaths();
  assert.equal(paths.indexOf(couchbase.guide), paths.indexOf(couchbase.path) + 1);
  withEnabled({ [couchbase.id]: false }, () => assert.ok(!sitemapPaths().includes(couchbase.guide)));
});

for (const { id, path } of PLATFORM_DEFINITIONS) {
  test(`drops ${path} when ${id} is disabled, keeping the other calculators`, () => {
    withEnabled({ [id]: false }, () => {
      const xml = buildSitemapXml(sitemapPaths());
      assert.ok(!xml.includes(path));
      for (const other of PLATFORM_PATHS.filter((p) => p !== path)) {
        assert.ok(xml.includes(`https://memorylimit.dev${other}`), other);
      }
    });
  });
}

test('never lists the /k8s/ redirect', () => {
  assert.ok(!buildSitemapXml().includes('/k8s/'));
});

test('the committed sitemap.xml is up to date with ENABLED_PLATFORMS', () => {
  const committed = readFileSync(join(import.meta.dirname, '..', 'public', 'sitemap.xml'), 'utf8');
  assert.equal(committed, buildSitemapXml(), 'run `npm run generate:sitemap`');
});
