import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { acceptQuality, prefersMarkdown } from '../src/worker.js';

test('prefersMarkdown follows the Accept header', () => {
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.9'), false);
  assert.equal(prefersMarkdown('text/html,application/xhtml+xml,*/*;q=0.8'), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
  assert.equal(prefersMarkdown(null), false);
});

test('acceptQuality uses the most specific matching range', () => {
  assert.equal(acceptQuality('text/*;q=0.5, text/markdown;q=0.2', 'text/markdown'), 0.2);
  assert.equal(acceptQuality('text/*;q=0.5', 'text/html'), 0.5);
  assert.equal(acceptQuality('application/json', 'text/html'), 0);
});

// Stand-in for the ASSETS binding: knows one page and its mirror.
const assets = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/kubernetes/') return new Response('<h1>html</h1>', { headers: { 'Content-Type': 'text/html' } });
    if (pathname === '/kubernetes/index.md') return new Response('# md', { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
    return new Response('not found', { status: 404 });
  }
};
const get = (path, accept) => worker.fetch(new Request(`https://memorylimit.dev${path}`, { headers: accept ? { Accept: accept } : {} }), { ASSETS: assets });

test('a Markdown request for a page gets its mirror, varying on Accept', async () => {
  const res = await get('/kubernetes/', 'text/markdown');
  assert.equal(await res.text(), '# md');
  assert.match(res.headers.get('Content-Type'), /^text\/markdown/);
  assert.equal(res.headers.get('Vary'), 'Accept');
});

test('a browser request gets the HTML, also varying on Accept', async () => {
  const res = await get('/kubernetes/', 'text/html,*/*;q=0.8');
  assert.equal(await res.text(), '<h1>html</h1>');
  assert.equal(res.headers.get('Vary'), 'Accept');
});

test('a page without a mirror falls back to whatever the assets return', async () => {
  const res = await get('/nope/', 'text/markdown');
  assert.equal(res.status, 404);
});
