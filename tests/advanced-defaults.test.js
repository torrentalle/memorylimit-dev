// Every value a page sends to its formatter by default — a field's HTML value, a select's selected option — is
// written twice: once in the page and once as the formatter's own default. "Reset to defaults" restores the
// page's, so if only the formatter's changed, the page would keep sending the old value and no other test would
// notice. These tests tie the two together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as kubernetes from '../public/js/formatters/kubernetes.js';
import * as systemd from '../public/js/formatters/systemd.js';
import * as redis from '../public/js/formatters/redis.js';
import * as azureFunctions from '../public/js/formatters/azure-functions.js';
import * as cloudRun from '../public/js/formatters/cloud-run.js';
import * as couchbase from '../public/js/formatters/couchbase.js';

const page = (dir) => readFileSync(join(import.meta.dirname, '..', 'public', dir, 'index.html'), 'utf8');

/** { name: default } for the controls carrying `attribute` on a page, as the page script reads them. */
function pageDefaults(html, attribute) {
  const defaults = {};
  for (const [tag] of html.matchAll(new RegExp(`<input[^>]*${attribute}="[^"]+"[^>]*>`, 'g'))) {
    const name = tag.match(new RegExp(`${attribute}="([^"]+)"`))[1];
    const value = tag.match(/\svalue="([^"]*)"/)?.[1];
    if (value === undefined || value === '') continue; // an empty field sends nothing: the formatter's default applies
    const unit = tag.match(/data-unit="([^"]+)"/)?.[1];
    defaults[name] = Number(value) * (unit === 'percent' ? 1 / 100 : unit === 'gib' ? 1024 : 1);
  }
  for (const [, attrs, body] of html.matchAll(new RegExp(`<select([^>]*${attribute}="[^"]+"[^>]*)>([\\s\\S]*?)</select>`, 'g'))) {
    const name = attrs.match(new RegExp(`${attribute}="([^"]+)"`))[1];
    const options = [...body.matchAll(/<option value="([^"]*)"([^>]*)>/g)];
    defaults[name] = (options.find(([, , rest]) => /\sselected\b/.test(rest)) ?? options[0])[1];
  }
  return defaults;
}

const FORMATTER_DEFAULTS = {
  kubernetes: {
    qos: kubernetes.QOS_CLASSES[0],
    requestBasis: kubernetes.REQUEST_BASES[0],
    overcommitRatio: kubernetes.OVERCOMMIT_RATIO,
    vpaMargin: kubernetes.VPA_MARGIN,
    vpaMinMiB: kubernetes.VPA_MIN_MIB
  },
  systemd: { maxToHighRatio: systemd.MAX_TO_HIGH_RATIO },
  redis: { provisionFactor: redis.PERSISTENCE_OVERHEAD },
  'azure-functions': { minInstanceMB: String(azureFunctions.DEFAULT_FLEX_MB) },
  'cloud-run': { currentConcurrency: cloudRun.DEFAULT_CONCURRENCY }
};

for (const [dir, expected] of Object.entries(FORMATTER_DEFAULTS)) {
  test(`${dir}: every option's default on the page is the formatter's default`, () => {
    const defaults = pageDefaults(page(dir), 'data-formatter-option');
    assert.deepEqual(Object.keys(defaults).sort(), Object.keys(expected).sort(), 'list every option with a default here');
    for (const [name, value] of Object.entries(expected)) assert.equal(defaults[name], value, name);
  });
}

test('no other page has an option with a default this test doesn’t check', () => {
  for (const dir of ['docker-compose', 'nomad', 'lambda', 'vmware', 'proxmox']) {
    assert.deepEqual(pageDefaults(page(dir), 'data-formatter-option'), {}, dir);
  }
});

test('couchbase: every advanced setting’s default on the page is calculateSizing()’s default', () => {
  const defaults = pageDefaults(page('couchbase'), 'data-setting');
  assert.deepEqual(Object.keys(defaults).sort(), Object.keys(couchbase.DEFAULT_SETTINGS).sort());
  for (const [name, value] of Object.entries(couchbase.DEFAULT_SETTINGS)) {
    if (typeof value === 'number') assert.ok(Math.abs(defaults[name] - value) < 1e-9, `${name}: ${defaults[name]} vs ${value}`);
    else assert.equal(defaults[name], value, name);
  }
});

test('every margin override field accepts exactly MARGIN_OVERRIDE_RANGE, in percent', async () => {
  const { MARGIN_OVERRIDE_RANGE } = await import('../public/js/calculator.js');
  const { PLATFORM_DEFINITIONS, entryUrl } = await import('../public/js/platforms.js');
  const dirs = PLATFORM_DEFINITIONS.filter((def) => entryUrl(def) === '/js/calculator-page.js').map((def) => def.path.slice(1, -1));
  for (const dir of dirs) {
    for (const id of ['request-margin-input', 'limit-margin-input']) {
      const tag = page(dir).match(new RegExp(`<input id="${id}"[^>]*>`))?.[0];
      assert.ok(tag, `${dir}: #${id}`);
      assert.match(tag, new RegExp(`min="${MARGIN_OVERRIDE_RANGE.min * 100}"`), `${dir}: #${id} min`);
      assert.match(tag, new RegExp(`max="${MARGIN_OVERRIDE_RANGE.max * 100}"`), `${dir}: #${id} max`);
      assert.match(tag, /data-unit="percent"/, `${dir}: #${id} unit`);
    }
  }
});
