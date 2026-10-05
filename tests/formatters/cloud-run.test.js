import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as cloudRun from '../../public/js/formatters/cloud-run.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact gcloud command and service.yaml for a known input', () => {
  const result = cloudRun.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'gcloud run services update <service> --memory 819Mi');
  assert.equal(
    result.alternative.code,
    'spec:\n  template:\n    spec:\n      containers:\n      - resources:\n          limits:\n            memory: 819Mi'
  );
});

test('is peak-based and rounds up to a whole Mi and no further', () => {
  const input = raw({ averageMiB: 50, peakMiB: 629.4 });
  assert.equal(cloudRun.format(input).memory, Math.ceil(input.limitMiB));
});

test('writes whole gibibytes as Gi', () => {
  assert.equal(cloudRun.formatQuantity(1024), '1Gi');
  assert.equal(cloudRun.formatQuantity(1025), '1025Mi');
});

test('adds the minimum CPU Cloud Run requires above 4 GiB, in the command and the YAML', () => {
  assert.equal(cloudRun.minimumCpu(4096), 1);
  assert.equal(cloudRun.minimumCpu(4097), 2);
  assert.equal(cloudRun.minimumCpu(16384), 4);
  assert.equal(cloudRun.minimumCpu(24576), 6);
  assert.equal(cloudRun.minimumCpu(32768), 8);
  const result = cloudRun.format(raw({ averageMiB: 4000, peakMiB: 5000 }));
  assert.equal(result.snippet.code, 'gcloud run services update <service> --memory 6500Mi --cpu 2');
  assert.equal(
    result.alternative.code,
    'spec:\n  template:\n    spec:\n      containers:\n      - resources:\n          limits:\n            memory: 6500Mi\n            cpu: 2'
  );
  assert.equal(result.explanationSteps[1].text, '6500Mi needs at least 2 vCPU');
});

test('up to 4 GiB the default 1 vCPU is enough', () => {
  const result = cloudRun.format(raw());
  assert.equal(result.cpu, 1);
  assert.equal(result.explanationSteps[1].text, 'the default 1 vCPU covers up to 4Gi');
});

test('clamps to 128Mi and warns that second generation needs 512Mi', () => {
  const result = cloudRun.format(raw({ averageMiB: 10, peakMiB: 50, sensitivity: 'low' }));
  assert.equal(result.memory, 128);
  assert.deepEqual(result.warnings.map((w) => w.code), ['cloud-run-range-clamped', 'cloud-run-gen2-minimum']);
});

test('clamps to 32Gi with 8 vCPU', () => {
  const result = cloudRun.format(raw({ averageMiB: 20000, peakMiB: 30000, workloadType: 'worker', sensitivity: 'high' }));
  assert.equal(result.snippet.code, 'gcloud run services update <service> --memory 32Gi --cpu 8');
  assert.ok(result.warnings.some((w) => w.code === 'cloud-run-range-clamped'));
});

test('explains the derivation in short steps with the real numbers', () => {
  assert.deepEqual(cloudRun.format(raw({ averageMiB: 410, peakMiB: 630 })).explanationSteps, [
    { label: 'Memory', text: '630 MiB peak + 30% = 819 MiB → 819Mi' },
    { label: 'CPU', text: 'the default 1 vCPU covers up to 4Gi' }
  ]);
});

test('the note gives Google’s concurrency formula and the in-memory filesystem, within three sentences', () => {
  const { note } = cloudRun.format(raw());
  assert.match(note, /memory per request × concurrency: fill in the idle memory/);
  assert.match(note, /filesystem/);
  assert.ok(note.split(/(?<=\.) /).length <= 3);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'cloud-run', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment, standingMiB, currentConcurrency, targetConcurrency] = example.split(' ');
    const options = standingMiB ? { standingMiB: Number(standingMiB), currentConcurrency: Number(currentConcurrency), targetConcurrency: Number(targetConcurrency) } : {};
    const result = cloudRun.format(calculateRawSizing({ averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }), options);
    const expected = { memory: cloudRun.formatQuantity(result.memory), cpu: `${result.cpu} vCPU` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites Google’s documentation', () => {
  for (const url of [
    'https://docs.cloud.google.com/run/docs/configuring/services/memory-limits',
    'https://docs.cloud.google.com/run/docs/configuring/services/cpu',
    'https://docs.cloud.google.com/run/docs/container-contract'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});

test('applies Google’s formula when concurrency changes: idle + per-request memory × planned concurrency', () => {
  const result = cloudRun.format(raw({ averageMiB: 410, peakMiB: 630 }), { standingMiB: 120, currentConcurrency: 80, targetConcurrency: 160 });
  // per request = (630 − 120) ÷ 80 = 6.375 MiB; planned peak = 120 + 6.375 × 160 = 1140 MiB; × 1.30 = 1482
  assert.equal(result.plannedPeakMiB, 1140);
  assert.equal(result.memory, 1482);
  assert.equal(result.explanationSteps[0].text, '120 MiB idle + (630 − 120) ÷ 80 × 160 requests = 1140 MiB planned peak');
  assert.ok(!result.warnings.some((w) => w.code === 'cloud-run-no-idle-memory'));
});

test('without a change in concurrency the result is the measured peak, whatever the idle memory', () => {
  const plain = cloudRun.format(raw({ averageMiB: 410, peakMiB: 630 }));
  const same = cloudRun.format(raw({ averageMiB: 410, peakMiB: 630 }), { standingMiB: 120, currentConcurrency: 80, targetConcurrency: 80 });
  assert.equal(same.memory, plain.memory);
  assert.equal(same.explanationSteps.length, 2);
});

test('without idle memory, scaling treats the whole peak as per-request memory and says which bound it is', () => {
  const up = cloudRun.format(raw({ averageMiB: 410, peakMiB: 630 }), { currentConcurrency: 80, targetConcurrency: 160 });
  assert.match(up.warnings.find((w) => w.code === 'cloud-run-no-idle-memory').message, /an upper bound/);
  const down = cloudRun.format(raw({ averageMiB: 410, peakMiB: 630 }), { currentConcurrency: 80, targetConcurrency: 40 });
  assert.match(down.warnings.find((w) => w.code === 'cloud-run-no-idle-memory').message, /a lower bound/);
});

test('concurrency is kept within Cloud Run’s 1–1000', () => {
  assert.equal(cloudRun.plannedPeak(630, { currentConcurrency: 80, targetConcurrency: 5000 }).target, 1000);
  assert.equal(cloudRun.plannedPeak(630, { currentConcurrency: 0.2 }).current, 1);
});
