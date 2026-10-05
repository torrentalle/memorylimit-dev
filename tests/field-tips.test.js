import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_FIELD_TIPS, fieldTipsFor } from '../public/js/field-tip-texts.js';
import { PLATFORM_DEFINITIONS, entryUrl, formatterUrl } from '../public/js/platforms.js';

// The platforms on the shared calculator page (Couchbase has its own page script and tooltips).
const SHARED_PAGE_PLATFORMS = PLATFORM_DEFINITIONS.filter((def) => entryUrl(def) === '/js/calculator-page.js');
const loadFormatter = (def) => import(`../public${formatterUrl(def)}`);

test('fieldTipsFor() applies a formatter’s overrides and drops the tips it sets to null', () => {
  const tips = fieldTipsFor({ fieldTips: { avg: null, peak: 'Custom.' } });
  assert.equal(tips.avg, undefined);
  assert.equal(tips.peak, 'Custom.');
  assert.equal(tips.workload, DEFAULT_FIELD_TIPS.workload);
  assert.deepEqual(fieldTipsFor({}), DEFAULT_FIELD_TIPS);
});

for (const def of SHARED_PAGE_PLATFORMS) {
  test(`${def.id}: field tooltips are single sentences, for shared fields or the page's own options`, async () => {
    const formatter = await loadFormatter(def);
    // A platform's own fields carry data-formatter-option="name" on its page.
    const page = readFileSync(join(import.meta.dirname, '..', 'public', def.path.slice(1), 'index.html'), 'utf8');
    const ownOptions = [...page.matchAll(/data-formatter-option="([^"]+)"/g)].map((m) => m[1]);
    for (const key of Object.keys(formatter.fieldTips ?? {})) assert.ok(key in DEFAULT_FIELD_TIPS || ownOptions.includes(key), key);
    for (const [key, text] of Object.entries(fieldTipsFor(formatter))) {
      assert.match(text, /^[^.]+(\.\d[^.]*)*\.$/, `${key}: one sentence ending in a full stop`);
    }
  });
}

test('couchbase: field tooltips are single sentences, for the page’s own fields or its advanced settings', async () => {
  const couchbase = await import('../public/js/formatters/couchbase.js');
  const page = readFileSync(join(import.meta.dirname, '..', 'public', 'couchbase', 'index.html'), 'utf8');
  const settings = [...page.matchAll(/data-setting="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(settings.length >= 6);
  for (const key of Object.keys(couchbase.fieldTips)) assert.ok(['dataNodes', 'nodeRam', ...settings].includes(key), key);
  for (const setting of settings) assert.ok(setting in couchbase.fieldTips, `${setting} has a tooltip`);
  for (const [key, text] of Object.entries({ ...couchbase.fieldTips, ...couchbase.bucketFieldTips })) {
    assert.match(text, /^[^.]+(\.\d[^.]*)*\.$/, `${key}: one sentence ending in a full stop`);
  }
});

test('platforms sized only from the peak show no tooltip on the average, which doesn’t change their result', async () => {
  for (const id of ['lambda', 'cloudRun', 'azureFunctions']) {
    const formatter = await loadFormatter(PLATFORM_DEFINITIONS.find((def) => def.id === id));
    assert.equal(fieldTipsFor(formatter).avg, undefined, id);
  }
});
