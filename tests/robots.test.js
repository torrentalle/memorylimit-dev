import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const robots = readFileSync(join(import.meta.dirname, '..', 'public', 'robots.txt'), 'utf8');

test('robots.txt allows everything and declares Content Signals in the User-agent: * group', () => {
  const group = robots.split(/\n\s*\n/).find((block) => /^User-agent: \*$/m.test(block));
  assert.ok(group, 'has a User-agent: * group');
  assert.match(group, /^Allow: \/$/m);
  assert.match(group, /^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m);
});

test('robots.txt points to the sitemap', () => {
  assert.match(robots, /^Sitemap: https:\/\/memorylimit\.dev\/sitemap\.xml$/m);
});
