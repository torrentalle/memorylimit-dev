import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEADERS_END,
  HEADERS_START,
  PUBLIC_DIR,
  buildMarkdownSite,
  parseHtml,
  slugify,
  staleFiles,
  withHeadersBlock
} from '../scripts/generate-markdown.js';
import { BASE_URL, sitemapPaths } from '../scripts/generate-sitemap.js';

const { files, headers } = buildMarkdownSite();

test('every committed mirror matches what scripts/generate-markdown.js produces', () => {
  const outOfDate = [...files].filter(([rel, text]) => !existsSync(join(PUBLIC_DIR, rel)) || readFileSync(join(PUBLIC_DIR, rel), 'utf8') !== text).map(([rel]) => rel);
  assert.deepEqual(outOfDate, [], 'run npm run generate:markdown');
});

test('no mirror file is left behind once a page or topic is gone', () => {
  assert.deepEqual(staleFiles(files), []);
});

test('public/_headers carries the generated Markdown block', () => {
  const current = readFileSync(join(PUBLIC_DIR, '_headers'), 'utf8');
  assert.equal(withHeadersBlock(current, headers), current, 'run npm run generate:markdown');
});

test('there is one mirror per sitemap page, plus llms.txt, sitemap.md and the topic maps', () => {
  for (const path of sitemapPaths()) {
    assert.ok(files.has(path === '/' ? 'index.md' : `${path.slice(1)}index.md`), `${path} has a mirror`);
  }
  assert.ok(files.has('llms.txt') && files.has('sitemap.md'));
});

test('every mirror names its canonical HTML page and gets a canonical Link header', () => {
  for (const path of sitemapPaths()) {
    const rel = path === '/' ? 'index.md' : `${path.slice(1)}index.md`;
    assert.ok(files.get(rel).includes(`Canonical: [`) && files.get(rel).includes(`](${BASE_URL}${path})`), `${rel} names ${path}`);
    assert.ok(headers.includes(`/${rel}\n  Content-Type: text/markdown; charset=utf-8\n  Link: <${BASE_URL}${path}>; rel="canonical"`), `${rel} has its Link header`);
  }
});

const headingSlugs = (markdown) => {
  const counts = {};
  const slugs = new Set();
  for (const [, text] of markdown.matchAll(/^#{1,6} (.+)$/gm)) {
    const base = slugify(text);
    const seen = counts[base] ?? 0;
    counts[base] = seen + 1;
    slugs.add(seen === 0 ? base : `${base}-${seen}`);
  }
  return slugs;
};

test('every site link in a mirror resolves, and every #fragment is a heading of its target', () => {
  const broken = [];
  for (const [rel, text] of files) {
    for (const [, target] of text.matchAll(/\]\((https:\/\/memorylimit\.dev\/[^)\s]*)\)/g)) {
      const [url, fragment] = target.split('#');
      const relPath = url.slice(BASE_URL.length + 1);
      const isMirror = files.has(relPath);
      if (!isMirror && !existsSync(join(PUBLIC_DIR, relPath))) broken.push(`${rel} -> ${target}`);
      else if (fragment && (!isMirror || !headingSlugs(files.get(relPath)).has(fragment))) broken.push(`${rel} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('mirrors carry no interface leftovers or unresolved placeholders', () => {
  const offenders = [];
  for (const [rel, text] of files) {
    if (/\u0000|undefined|\[object|currently turned off|Enter usage data to see|opens in a new tab/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test('a calculator mirror lists its inputs and what you get, but not hidden fields', () => {
  const lambda = files.get('lambda/index.md');
  assert.match(lambda, /^- \*\*Peak usage\*\* \(MiB\)$/m);
  assert.match(lambda, /^## What you get$/m);
  assert.doesNotMatch(lambda, /Replica count/);
});

test('parseHtml builds a tree, decodes entities and skips script bodies', () => {
  const tree = parseHtml('<p class="a">x &amp; <code>y&lt;z</code></p><script>if (a < b) {}</script><br>');
  const [p, script] = tree.children;
  assert.equal(p.tag, 'p');
  assert.equal(p.attrs.class, 'a');
  assert.equal(p.children[0].text, 'x & ');
  assert.equal(p.children[1].children[0].text, 'y<z');
  assert.equal(script.children.length, 0);
});

test('slugify follows GitHub heading anchors', () => {
  assert.equal(slugify('All assumptions in one place'), 'all-assumptions-in-one-place');
  assert.equal(slugify("Step 1 — each bucket's quota"), 'step-1--each-buckets-quota');
});

test('withHeadersBlock replaces the marked block and appends it when absent', () => {
  const block = `${HEADERS_START}\n/x\n  A: b\n${HEADERS_END}`;
  const replaced = withHeadersBlock(`/*\n  C: d\n\n${HEADERS_START}\nold\n${HEADERS_END}\n`, block);
  assert.ok(replaced.includes('/x') && !replaced.includes('old'));
  assert.ok(withHeadersBlock('/*\n  C: d\n', block).endsWith(`${HEADERS_END}\n`));
});
