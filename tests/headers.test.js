import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeaders, parseCsp } from './helpers/headers.js';

const rules = parseHeaders();
const csp = parseCsp(rules['/*']['Content-Security-Policy']);

test('every page gets a Content-Security-Policy', () => {
  assert.ok(rules['/*']['Content-Security-Policy']);
});

test('scripts are limited to the site and the two configured third parties, never inline or eval', () => {
  assert.deepEqual(csp['script-src'], [
    "'self'",
    'https://media.ethicalads.io',
    'https://server.ethicalads.io',
    'https://static.cloudflareinsights.com'
  ]);
  for (const directive of Object.values(csp)) {
    assert.ok(!directive.includes("'unsafe-eval'"));
  }
});

test('locks down framing, plugins, base URLs and form targets', () => {
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.deepEqual(csp['form-action'], ["'self'"]);
  assert.deepEqual(csp['font-src'], ["'self'"]);
});

test('allows the analytics beacon to report', () => {
  assert.ok(csp['connect-src'].includes('https://cloudflareinsights.com'));
});

test('sets the baseline security headers', () => {
  assert.equal(rules['/*']['X-Content-Type-Options'], 'nosniff');
  assert.equal(rules['/*']['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(rules['/*']['Permissions-Policy'], /camera=\(\)/);
});

test('keeps short cache lifetimes for unhashed assets', () => {
  for (const path of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/brand/*', '/og-image.png']) {
    assert.equal(rules[path]?.['Cache-Control'], 'public, max-age=86400', path);
  }
  assert.equal(rules['/js/*'], undefined);
  assert.equal(rules['/css/*'], undefined);
});
