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
  assert.equal(result.snippet.code, 'govc vm.change -vm "<vm-name>" -m 910 -mem.reservation 507 -mem.limit -1 -mem.shares normal');
  assert.equal(
    result.alternative.code,
    'Edit Settings → Virtual Hardware → Memory → set Memory to 910 MB, Reservation to 507 MB, Limit to Unlimited, Shares to Normal.'
  );
});

test('follows VMware’s advice: the configured memory is the cap and no limit is set', () => {
  const result = vmware.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.deepEqual([result.memory, result.reservation, result.limit], [819, 586, -1]);
  assert.ok(result.figures.some((f) => f.label === 'Limit' && f.text === 'Unlimited'));
});

test('memory and reservation round up to a whole MB and no further', () => {
  const input = raw({ averageMiB: 401, peakMiB: 601 });
  const result = vmware.format(input);
  assert.equal(result.reservation, Math.ceil(input.requestMiB));
  assert.equal(result.memory, Math.ceil(input.limitMiB));
});

test('never reserves more than the configured memory', () => {
  const result = vmware.format(raw({ workloadType: 'cache', averageMiB: 1000, peakMiB: 1020 }));
  assert.equal(result.memory, result.reservation);
  const warning = result.warnings.find((w) => w.code === 'memory-raised-to-reservation');
  assert.match(warning.message, /can't be larger than the VM's configured memory/);
  assert.match(result.explanationSteps[0].text, /raised to the reservation → 1350 MB$/);
});

test('shares are a fixed, informational Normal', () => {
  const result = vmware.format(raw());
  assert.equal(result.shares, 'Normal');
  assert.deepEqual(result.figures.at(-1), { role: 'info', label: 'Shares', text: 'Normal', detail: '10 shares per MB — informational' });
});

test('gauge markers are labelled reservation / memory', () => {
  assert.deepEqual(vmware.format(raw()).markers.map((m) => m.name), ['reservation', 'memory']);
});

test('carries through the peak-below-average warning', () => {
  assert.ok(vmware.format(raw({ averageMiB: 500, peakMiB: 100 })).warnings.some((w) => w.code === 'peak-below-average'));
});

test('explains the derivation in three short steps with the real numbers', () => {
  assert.deepEqual(vmware.format(raw({ averageMiB: 390, peakMiB: 700 })).explanationSteps, [
    { label: 'Memory', text: '700 MiB peak + 30% = 910 MiB → 910 MB' },
    { label: 'Reservation', text: '390 MiB average + 30% = 507 MiB → 507 MB' },
    { label: 'Limit', text: 'Unlimited, so the configured memory is the cap' }
  ]);
});

test('the note covers no limit, hot add and the unreserved 10% within three sentences', () => {
  const { note } = vmware.format(raw());
  assert.match(note, /no limit is set/);
  assert.match(note, /memory hot add/);
  assert.match(note, /10% of the host unreserved/);
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
    const expected = { reservation: `${result.reservation} MB`, memory: `${result.memory} MB` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites the vSphere documentation and govc', () => {
  for (const url of [
    'https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/9-0/vsphere-resource-management/configuring-resource-allocation-settings.html',
    'https://github.com/vmware/govmomi/blob/main/govc/USAGE.md'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
