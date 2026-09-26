import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION_HOST, isProductionHost } from '../public/js/env.js';

test("PRODUCTION_HOST is the site's real domain", () => {
  assert.equal(PRODUCTION_HOST, 'memorylimit.dev');
});

test('isProductionHost is true only for the exact production hostname', () => {
  assert.equal(isProductionHost(PRODUCTION_HOST), true);
});

test('isProductionHost rejects previews, subdomains, localhost and lookalikes', () => {
  for (const hostname of ['staging.example.com', 'memorylimit.dev.evil.com', 'evilmemorylimit.dev', 'localhost', '', undefined]) {
    assert.equal(isProductionHost(hostname), false, String(hostname));
  }
});

test('outside a browser (no global `location`), the default is never the production host', () => {
  assert.equal(typeof location, 'undefined');
  assert.equal(isProductionHost(), false);
});
