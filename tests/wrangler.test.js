// Cloudflare's build pipeline needs a `previews` block in the Wrangler
// config to build a branch preview deployment (Pages branch previews,
// ADR 0014) — without it the build fails with "Your Wrangler configuration
// is missing a `previews` block". wrangler.jsonc holds nothing else: the
// site itself is still a plain static build with no Workers code
// (ADR 0002), configured through the Cloudflare Pages dashboard as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_PATH = join(import.meta.dirname, '..', 'wrangler.jsonc');

test('wrangler.jsonc exists, is valid JSON and declares a previews block', () => {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  assert.deepEqual(config.previews, {});
});
