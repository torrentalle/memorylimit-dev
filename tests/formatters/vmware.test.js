import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as vmware from '../../public/js/formatters/vmware.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact vSphere Client steps and govc command for a known input', () => {
  // 390 × 1.3 = 507 → 512 MB reservation; 700 × 1.3 = 910 → 1024 MB limit.
  const result = vmware.format(raw({ averageMiB: 390, peakMiB: 700 }));
  assert.equal(result.reservation, 512);
  assert.equal(result.limit, 1024);
  assert.deepEqual(result.alternative, {
    label: 'In vSphere Client',
    code: 'Edit Settings → Virtual Hardware → Memory → set Reservation to 512 MB, Limit to 1024 MB, Shares to Normal.'
  });
  assert.equal(
    result.snippet.code,
    'govc vm.change -vm "<vm-name>" -mem.reservation 512 -mem.limit 1024 -mem.shares normal'
  );
});

test('golden: the Kubernetes reference input maps to 640 MB / 1024 MB', () => {
  const result = vmware.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'govc vm.change -vm "<vm-name>" -mem.reservation 640 -mem.limit 1024 -mem.shares normal');
});

test('uses the govc flags that set reservation/limit, not -m (which resizes the VM)', () => {
  const { code } = vmware.format(raw()).snippet;
  assert.match(code, /-mem\.reservation \d+ -mem\.limit \d+/);
  assert.doesNotMatch(code, /\s-m[\s.]/);
});

test('reservation rounds up to 128 MB and limit to 256 MB', () => {
  for (const [averageMiB, peakMiB] of [[401, 601], [1000, 3000], [130, 140]]) {
    const result = vmware.format(raw({ averageMiB, peakMiB }));
    assert.equal(result.reservation % 128, 0);
    assert.equal(result.limit % 256, 0);
  }
});

test('never emits a reservation above the limit, which vSphere rejects', () => {
  const result = vmware.format(raw({ averageMiB: 2000, peakMiB: 2000, sensitivity: 'high' }));
  assert.equal(result.reservation, 3072);
  assert.equal(result.limit, 3072);
  assert.ok(result.warnings.some((w) => w.code === 'limit-raised-to-reservation'));
  assert.match(result.explanation, /raised to match the reservation → 3072 MB\.$/);
});

test('does not warn when the peak leaves room above the reservation', () => {
  assert.deepEqual(vmware.format(raw()).warnings, []);
});

test('shares are a fixed, informational Normal', () => {
  const result = vmware.format(raw({ sensitivity: 'high', workloadType: 'jvm' }));
  assert.equal(result.shares, 'Normal');
  assert.deepEqual(result.figures.map((f) => [f.label, f.text]), [
    ['Reservation', `${result.reservation} MB`],
    ['Limit', `${result.limit} MB`],
    ['Shares', 'Normal']
  ]);
});

test('gauge markers are labelled reservation / limit', () => {
  assert.deepEqual(vmware.format(raw()).markers.map((m) => [m.role, m.name]), [['request', 'reservation'], ['limit', 'limit']]);
});

test('carries through the peak-below-average warning', () => {
  assert.ok(vmware.format(raw({ averageMiB: 500, peakMiB: 100 })).warnings.some((w) => w.code === 'peak-below-average'));
});

test('includes the ballooning note and the shares guidance', () => {
  const { note } = vmware.format(raw());
  assert.match(note, /^Setting a memory limit below the VM’s configured memory size triggers ballooning\/swapping rather than an OOM-kill/);
  assert.match(note, /Shares stay at Normal, the vSphere default/);
});
