import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as lambda from '../../public/js/formatters/lambda.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('recommendation is peak-based, not average-based', () => {
  assert.equal(lambda.format(raw({ averageMiB: 50, peakMiB: 500 })).memorySize, 650);
});

test('rounds up to the nearest 1 MB', () => {
  // 501 × 1.30 = 651.3 → 652
  assert.equal(lambda.format(raw({ peakMiB: 501 })).memorySize, 652);
});

test('clamps extremely small results up to 128 MB and warns', () => {
  const result = lambda.format(raw({ averageMiB: 10, peakMiB: 50, sensitivity: 'low' }));
  assert.equal(result.memorySize, 128);
  assert.ok(result.warnings.some((w) => w.code === 'lambda-range-clamped'));
  assert.match(result.explanation, /clamped to Lambda’s 128–10240MB range → 128MB\.$/);
});

test('clamps extremely large results down to 10240 MB and warns', () => {
  const result = lambda.format(raw({ averageMiB: 5000, peakMiB: 20000, workloadType: 'worker', sensitivity: 'high' }));
  assert.equal(result.memorySize, 10240);
  assert.ok(result.warnings.some((w) => w.code === 'lambda-range-clamped'));
});

test('does not warn when the result is comfortably within range', () => {
  assert.ok(!lambda.format(raw()).warnings.some((w) => w.code === 'lambda-range-clamped'));
});

test('explanation states the rounded value once', () => {
  const { explanation } = lambda.format(raw({ averageMiB: 450, peakMiB: 630 }));
  assert.equal(
    explanation,
    'Memory = 630MiB peak + 30% margin (medium sensitivity, generic, production) → rounded up to 819MB.'
  );
});

test('produces a MemorySize JSON snippet and an equivalent AWS CLI command', () => {
  const { code } = lambda.format(raw()).snippet;
  assert.match(code, /\{ "MemorySize": 650 \}/);
  assert.match(code, /aws lambda update-function-configuration --memory-size 650/);
});

test('gauge markers show the peak reference and the recommended memory', () => {
  assert.deepEqual(lambda.format(raw()).markers.map((m) => m.role), ['peak', 'limit']);
});

test('includes the cost/latency trade-off note', () => {
  assert.match(lambda.format(raw()).note, /cost\/latency trade-off/);
});
