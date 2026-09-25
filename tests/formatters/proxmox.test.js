import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as proxmox from '../../public/js/formatters/proxmox.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact qm command and web UI steps for a known input', () => {
  const result = proxmox.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'qm set <vmid> --memory 1024 --balloon 640');
  assert.equal(
    result.alternative.code,
    'VM → Hardware → Memory → Edit → tick Advanced → Memory (MiB): 1024, Minimum memory (MiB): 640, Ballooning Device: on.'
  );
});

test('minimum rounds up to 128 MiB and memory to 256 MiB', () => {
  for (const [averageMiB, peakMiB] of [[401, 601], [1000, 3000], [130, 140]]) {
    const result = proxmox.format(raw({ averageMiB, peakMiB }));
    assert.equal(result.balloon % 128, 0);
    assert.equal(result.memory % 256, 0);
  }
});

test('never sets the minimum above memory, which Proxmox rejects', () => {
  const result = proxmox.format(raw({ averageMiB: 2000, peakMiB: 2000, sensitivity: 'high' }));
  assert.equal(result.balloon, 3072);
  assert.equal(result.memory, 3072);
  assert.ok(result.warnings.some((w) => w.code === 'memory-raised-to-minimum'));
});

test('mentions the auto-ballooning threshold and the Windows driver', () => {
  const { note } = proxmox.format(raw());
  assert.match(note, /80%/);
  assert.match(note, /VirtIO balloon driver/);
});
