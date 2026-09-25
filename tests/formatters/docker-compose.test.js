import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as dockerCompose from '../../public/js/formatters/docker-compose.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('rounds reservation and limit up to the nearest 10M', () => {
  const result = dockerCompose.format(raw({ averageMiB: 401, peakMiB: 601 }));
  assert.equal(result.reservation % 10, 0);
  assert.equal(result.limit % 10, 0);
});

test('produces a deploy.resources block', () => {
  const result = dockerCompose.format(raw());
  assert.equal(
    result.snippet.code,
    'deploy:\n  resources:\n    limits:\n      memory: 650M\n    reservations:\n      memory: 520M'
  );
});

test('offers the legacy mem_limit equivalent', () => {
  const result = dockerCompose.format(raw());
  assert.deepEqual(result.alternative, { label: 'Compose without Swarm deploy support', code: 'mem_limit: 650m' });
});

test('never emits a reservation above the limit for steady workloads', () => {
  for (const [workloadType, sensitivity, averageMiB, peakMiB] of [
    ['generic', 'high', 1000, 1050],
    ['cache', 'medium', 1000, 1020],
    ['cache', 'high', 800, 800]
  ]) {
    const result = dockerCompose.format(raw({ workloadType, sensitivity, averageMiB, peakMiB }));
    assert.ok(result.limit >= result.reservation, `${workloadType}/${sensitivity}: ${result.reservation}M > ${result.limit}M`);
    assert.ok(result.warnings.some((w) => w.code === 'limit-raised-to-reservation'));
    assert.match(result.explanation, /raised to match the reservation/);
  }
});

test('does not warn about the limit when peak leaves enough headroom', () => {
  const result = dockerCompose.format(raw());
  assert.ok(!result.warnings.some((w) => w.code === 'limit-raised-to-reservation'));
});

test('totalReservation multiplies reservation by replica count', () => {
  const result = dockerCompose.format(raw({ replicas: 4 }));
  assert.equal(result.totalReservation, result.reservation * 4);
});

test('carries through the peak-below-average warning from raw sizing', () => {
  const result = dockerCompose.format(raw({ averageMiB: 500, peakMiB: 100 }));
  assert.ok(result.warnings.some((w) => w.code === 'peak-below-average'));
});
