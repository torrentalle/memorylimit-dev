import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as vmware from '../../public/js/formatters/vmware.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact vSphere Client steps and govc command for a known input', () => {
  const result = vmware.format(raw({ averageMiB: 390, peakMiB: 700 }));
  assert.equal(result.snippet.code, 'govc vm.change -vm "<vm-name>" -mem.reservation 507 -mem.limit 910 -mem.shares normal');
  assert.equal(
    result.alternative.code,
    'Edit Settings → Virtual Hardware → Memory → set Reservation to 507 MB, Limit to 910 MB, Shares to Normal.'
  );
});

test('golden: the Kubernetes reference input maps to 586 MB / 819 MB', () => {
  const result = vmware.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.deepEqual([result.reservation, result.limit], [586, 819]);
});

test('uses the govc flags that set reservation/limit, not -m (which resizes the VM)', () => {
  const { code } = vmware.format(raw()).snippet;
  assert.match(code, /-mem\.reservation \d+ -mem\.limit \d+ -mem\.shares normal$/);
  assert.doesNotMatch(code, / -m /);
});

test('reservation and limit round up to a whole MB and no further', () => {
  const input = raw({ averageMiB: 401, peakMiB: 601 });
  const result = vmware.format(input);
  assert.equal(result.reservation, Math.ceil(input.requestMiB));
  assert.equal(result.limit, Math.ceil(input.limitMiB));
});

test('never emits a reservation above the limit, which can stop the VM powering on', () => {
  const result = vmware.format(raw({ workloadType: 'cache', averageMiB: 1000, peakMiB: 1020 }));
  assert.equal(result.limit, result.reservation);
  const warning = result.warnings.find((w) => w.code === 'limit-raised-to-reservation');
  assert.match(warning.message, /can fail to power on/);
  assert.match(result.explanationSteps[1].text, /raised to the reservation → 1350 MB$/);
});

test('does not warn when the peak leaves room above the reservation', () => {
  assert.ok(!vmware.format(raw()).warnings.some((w) => w.code === 'limit-raised-to-reservation'));
});

test('shares are a fixed, informational Normal', () => {
  const result = vmware.format(raw());
  assert.equal(result.shares, 'Normal');
  assert.deepEqual(result.figures.at(-1), { role: 'info', label: 'Shares', text: 'Normal', detail: '10 shares per MB — informational' });
});

test('gauge markers are labelled reservation / limit', () => {
  assert.deepEqual(vmware.format(raw()).markers.map((m) => m.name), ['reservation', 'limit']);
});

test('carries through the peak-below-average warning', () => {
  assert.ok(vmware.format(raw({ averageMiB: 500, peakMiB: 100 })).warnings.some((w) => w.code === 'peak-below-average'));
});

test('explains the derivation in two short steps with the real numbers', () => {
  assert.deepEqual(vmware.format(raw({ averageMiB: 390, peakMiB: 700 })).explanationSteps, [
    { label: 'Reservation', text: '390 MiB average + 30% = 507 MiB → 507 MB' },
    { label: 'Limit', text: '700 MiB peak + 30% = 910 MiB → 910 MB' }
  ]);
});

test('the note gives VMware’s own advice on limits and reservations within three sentences', () => {
  const { note } = vmware.format(raw());
  assert.match(note, /balloon and swap/);
  assert.match(note, /waste idle memory/);
  assert.match(note, /minimum acceptable memory/);
  assert.ok(note.split(/(?<=\.) /).length <= 3);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'vmware', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = example.split(' ');
    const result = vmware.format(calculateRawSizing({ averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }));
    const expected = { reservation: `${result.reservation} MB`, limit: `${result.limit} MB` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites the vSphere documentation and govc', () => {
  for (const url of [
    'https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/9-0/vsphere-resource-management/configuring-resource-allocation-settings.html',
    'https://github.com/vmware/govmomi/blob/main/govc/USAGE.md',
    'https://knowledge.broadcom.com/external/article/338772'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
