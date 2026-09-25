import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as systemd from '../../public/js/formatters/systemd.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: 295 MiB average / 390 MiB peak gives MemoryHigh=512M, MemoryMax=640M', () => {
  const result = systemd.format(raw({ averageMiB: 295, peakMiB: 390 }));
  assert.equal(result.snippet.code, '[Service]\nMemoryHigh=512M\nMemoryMax=640M');
  assert.equal(result.expectedUsage, 384);
});

test('golden: exact drop-in for the Kubernetes reference input', () => {
  const result = systemd.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, '[Service]\nMemoryHigh=832M\nMemoryMax=1024M');
});

test('MemoryHigh is peak-based so normal peaks are never throttled', () => {
  const input = raw({ averageMiB: 295, peakMiB: 390 });
  const result = systemd.format(input);
  assert.ok(result.memoryHigh >= input.limitMiB);
  assert.ok(result.memoryHigh > input.peakMiB);
});

test('MemoryMax sits 1.2× above MemoryHigh, rounded up to 64M', () => {
  for (const [averageMiB, peakMiB] of [[295, 390], [401, 601], [1000, 3000]]) {
    const result = systemd.format(raw({ averageMiB, peakMiB }));
    assert.equal(result.memoryHigh % 32, 0);
    assert.equal(result.memoryMax % 64, 0);
    assert.ok(result.memoryMax >= result.memoryHigh * systemd.MAX_TO_HIGH_RATIO);
    assert.ok(result.memoryMax < result.memoryHigh * systemd.MAX_TO_HIGH_RATIO + 64);
  }
});

test('never throttles below expected usage for steady workloads', () => {
  for (const [workloadType, sensitivity, averageMiB, peakMiB] of [
    ['generic', 'high', 1000, 1050],
    ['cache', 'medium', 1000, 1020],
    ['cache', 'high', 800, 800]
  ]) {
    const result = systemd.format(raw({ workloadType, sensitivity, averageMiB, peakMiB }));
    assert.ok(result.memoryHigh >= result.expectedUsage, `${workloadType}/${sensitivity}`);
  }
});

test('reports expected usage as an unenforced reference figure', () => {
  const { figures } = systemd.format(raw({ averageMiB: 295, peakMiB: 390 }));
  assert.deepEqual(figures.map((f) => [f.label, f.text]), [['Expected usage', '384M'], ['MemoryHigh', '512M'], ['MemoryMax', '640M']]);
  assert.match(figures[0].detail, /not enforced/);
});

test('offers install instructions as the secondary note', () => {
  const { alternative } = systemd.format(raw());
  assert.equal(alternative.label, 'Install');
  assert.match(alternative.code, /\/etc\/systemd\/system\/<service>\.service\.d\/override\.conf/);
  assert.match(alternative.code, /systemctl daemon-reload && systemctl restart <service>/);
});

test('gauge markers are labelled high / max', () => {
  assert.deepEqual(systemd.format(raw()).markers.map((m) => [m.role, m.name]), [['request', 'high'], ['limit', 'max']]);
});

test('reuses the shared warnings without adding its own', () => {
  assert.deepEqual(systemd.format(raw()).warnings, []);
  assert.deepEqual(systemd.format(raw({ averageMiB: 500, peakMiB: 100 })).warnings.map((w) => w.code), ['peak-below-average']);
});

test('explains the throttle-vs-kill design and the cgroup v2 requirement', () => {
  const { note, explanation } = systemd.format(raw({ averageMiB: 295, peakMiB: 390 }));
  assert.match(note, /just above your observed peak/);
  assert.match(note, /cgroup v2/);
  assert.equal(
    explanation,
    'MemoryHigh = 390MiB peak + 30% margin (medium sensitivity, generic, production) → rounded up to 512M; ' +
      'MemoryMax = 1.2× MemoryHigh → rounded up to 640M. ' +
      'Expected usage (not enforced) = 295MiB average + 30% margin → 384M.'
  );
});
