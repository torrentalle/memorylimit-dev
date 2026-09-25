import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as cloudRun from '../../public/js/formatters/cloud-run.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact gcloud command for a known input', () => {
  const result = cloudRun.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'gcloud run services update <service> --memory 832Mi');
  assert.equal(result.alternative.code, 'spec.template.spec.containers[0].resources.limits.memory: 832Mi');
});

test('is peak-based and rounds up to 64Mi', () => {
  assert.equal(cloudRun.format(raw({ averageMiB: 50, peakMiB: 629.4 })).memory, 832);
});

test('writes whole gibibytes as Gi', () => {
  // 740 × 1.3 = 962 → 1024 Mi
  assert.match(cloudRun.format(raw({ peakMiB: 740 })).snippet.code, /--memory 1Gi$/);
});

test('adds the minimum CPU Cloud Run requires for larger memory sizes', () => {
  assert.equal(cloudRun.minimumCpu(4096), 1);
  assert.equal(cloudRun.minimumCpu(4097), 2);
  assert.equal(cloudRun.minimumCpu(16384), 4);
  assert.equal(cloudRun.minimumCpu(24576), 6);
  assert.equal(cloudRun.minimumCpu(32768), 8);
  const result = cloudRun.format(raw({ averageMiB: 4000, peakMiB: 5000 }));
  assert.equal(result.snippet.code, 'gcloud run services update <service> --memory 6528Mi --cpu 2');
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

test('notes that memory scales with concurrency', () => {
  assert.match(cloudRun.format(raw()).note, /concurrency/);
});
