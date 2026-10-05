import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as systemd from '../../public/js/formatters/systemd.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: 295 MiB average / 390 MiB peak gives MemoryHigh=507M, MemoryMax=609M', () => {
  const result = systemd.format(raw({ averageMiB: 295, peakMiB: 390 }));
  assert.equal(result.snippet.code, '[Service]\nMemoryHigh=507M\nMemoryMax=609M');
  assert.equal(result.expectedUsage, 384);
});

test('golden: exact drop-in for the Kubernetes reference input', () => {
  const result = systemd.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, '[Service]\nMemoryHigh=819M\nMemoryMax=983M');
});

test('MemoryHigh is peak-based, rounded up to a whole M, so normal peaks are never throttled', () => {
  const input = raw({ averageMiB: 295, peakMiB: 390 });
  const result = systemd.format(input);
  assert.equal(result.memoryHigh, Math.ceil(input.limitMiB));
  assert.ok(result.memoryHigh > input.peakMiB);
});

test('MemoryMax is 1.2× MemoryHigh, rounded up to a whole M', () => {
  for (const [averageMiB, peakMiB] of [[295, 390], [401, 601], [1000, 3000]]) {
    const result = systemd.format(raw({ averageMiB, peakMiB }));
    assert.equal(result.memoryMax, Math.ceil(result.memoryHigh * systemd.MAX_TO_HIGH_RATIO - 1e-9));
  }
});

test('never throttles below expected usage for steady workloads, and says so', () => {
  for (const [workloadType, sensitivity, averageMiB, peakMiB] of [
    ['generic', 'high', 1000, 1050],
    ['cache', 'medium', 1000, 1020],
    ['cache', 'high', 800, 800]
  ]) {
    const result = systemd.format(raw({ workloadType, sensitivity, averageMiB, peakMiB }));
    assert.ok(result.memoryHigh >= result.expectedUsage, `${workloadType}/${sensitivity}`);
    assert.match(result.explanationSteps[0].text, /raised to expected usage/);
  }
});

test('reports expected usage as an unenforced reference figure', () => {
  const { figures } = systemd.format(raw({ averageMiB: 295, peakMiB: 390 }));
  assert.deepEqual(figures.map((f) => [f.label, f.text]), [['Expected usage', '384M'], ['MemoryHigh', '507M'], ['MemoryMax', '609M']]);
  assert.match(figures[0].detail, /not enforced/);
});

test('offers install instructions and the set-property command as the secondary note', () => {
  const { alternative } = systemd.format(raw({ averageMiB: 295, peakMiB: 390 }));
  assert.equal(alternative.label, 'Install');
  assert.match(alternative.code, /\/etc\/systemd\/system\/<service>\.service\.d\/override\.conf/);
  assert.match(alternative.code, /systemctl daemon-reload && systemctl restart <service>/);
  assert.match(alternative.code, /systemctl set-property <service>\.service MemoryHigh=507M MemoryMax=609M$/);
});

test('gauge markers are labelled high / max', () => {
  assert.deepEqual(systemd.format(raw()).markers.map((m) => [m.role, m.name]), [['request', 'high'], ['limit', 'max']]);
});

test('reuses the shared warnings without adding its own', () => {
  assert.deepEqual(systemd.format(raw()).warnings, []);
  assert.deepEqual(systemd.format(raw({ averageMiB: 500, peakMiB: 100 })).warnings.map((w) => w.code), ['peak-below-average']);
});

test('explains the derivation in three short steps with the real numbers', () => {
  assert.deepEqual(systemd.format(raw({ averageMiB: 295, peakMiB: 390 })).explanationSteps, [
    { label: 'MemoryHigh', text: '390 MiB peak + 30% = 507 MiB → 507M' },
    { label: 'MemoryMax', text: '1.2 × 507M = 608.4 MiB → 609M' },
    { label: 'Expected usage', text: '295 MiB average + 30% = 383.5 MiB → 384M, not enforced' }
  ]);
});

test('the note explains throttle-vs-kill and that cgroup v1 only has the deprecated MemoryLimit=', () => {
  const { note } = systemd.format(raw());
  assert.match(note, /just above your observed peak/);
  assert.match(note, /cgroup v2, the only hierarchy since systemd 258/);
  assert.match(note, /deprecated MemoryLimit=/);
  assert.ok(note.split(/(?<=\.) /).length <= 3);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'systemd', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = example.split(' ');
    const result = systemd.format(calculateRawSizing({ averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }));
    const expected = { memoryHigh: `${result.memoryHigh}M`, memoryMax: `${result.memoryMax}M`, expectedUsage: `${result.expectedUsage}M` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites systemd’s documentation', () => {
  for (const url of [
    'https://github.com/systemd/systemd/blob/main/man/systemd.resource-control.xml',
    'https://github.com/systemd/systemd/blob/main/NEWS'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
