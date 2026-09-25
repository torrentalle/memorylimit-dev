import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as nomad from '../../public/js/formatters/nomad.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact resources block for a known input', () => {
  const result = nomad.format(raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 }));
  assert.equal(result.snippet.code, 'resources {\n  memory     = 608\n  memory_max = 832\n}');
  assert.equal(result.totalReserved, 1824);
});

test('memory_max is never below 1.2× memory', () => {
  for (const [averageMiB, peakMiB, sensitivity] of [[1000, 1010, 'low'], [1000, 1000, 'high'], [400, 5000, 'medium']]) {
    const result = nomad.format(raw({ averageMiB, peakMiB, sensitivity }));
    assert.ok(result.memoryMax >= result.memory * nomad.MIN_MAX_TO_MEMORY_RATIO);
    assert.equal(result.memoryMax % 64, 0);
  }
});

test('explains that memory_max needs oversubscription enabled, with the command', () => {
  const result = nomad.format(raw());
  assert.equal(result.alternative.code, 'nomad operator scheduler set-config -memory-oversubscription=true');
  assert.match(result.note, /memory oversubscription enabled/);
});

test('gauge markers are labelled memory / memory_max', () => {
  assert.deepEqual(nomad.format(raw()).markers.map((m) => m.name), ['memory', 'memory_max']);
});
