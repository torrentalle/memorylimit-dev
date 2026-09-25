import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as kubernetes from '../../public/js/formatters/kubernetes.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

// Golden output: pins the exact manifest text for a known input so any
// change to rounding, flooring or YAML formatting shows up as a diff.
test('golden: exact manifest for a known input', () => {
  const result = kubernetes.format(raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 }));
  assert.equal(result.request, 608);
  assert.equal(result.limit, 832);
  assert.equal(result.totalRequest, 1824);
  assert.equal(result.snippet.code, 'resources:\n  requests:\n    memory: "608Mi"\n  limits:\n    memory: "832Mi"');
});

test('request rounds up to nearest 32Mi, limit to nearest 64Mi', () => {
  const result = kubernetes.format(raw({ averageMiB: 401, peakMiB: 601 }));
  assert.equal(result.request % 32, 0);
  assert.equal(result.limit % 64, 0);
});

test('burstable limit is never below 1.2× the rounded request', () => {
  const result = kubernetes.format(raw({ averageMiB: 1000, peakMiB: 1010, sensitivity: 'low' }));
  assert.ok(result.limit >= result.request * kubernetes.MIN_LIMIT_TO_REQUEST_RATIO);
});

test('guaranteed QoS sets request equal to limit and covers the peak', () => {
  const input = raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 });
  const result = kubernetes.format(input, { qos: 'guaranteed' });
  assert.equal(result.request, result.limit);
  assert.equal(result.limit % 64, 0);
  assert.ok(result.limit >= input.limitMiB);
  assert.equal(result.totalRequest, result.limit * 3);
  assert.match(result.explanation, /^Guaranteed QoS/);
});

test('guaranteed QoS also covers an average-based request larger than the peak-based limit', () => {
  const input = raw({ averageMiB: 1000, peakMiB: 1000, sensitivity: 'high' });
  const result = kubernetes.format(input, { qos: 'guaranteed' });
  assert.ok(result.limit >= input.requestMiB);
});

test('totalRequest multiplies request by replica count', () => {
  const result = kubernetes.format(raw({ replicas: 5 }));
  assert.equal(result.totalRequest, result.request * 5);
  assert.equal(result.figures.find((f) => f.role === 'total').detail, 'across 5 replicas');
});

test('warns about overcommit when the limit is far above the request', () => {
  const result = kubernetes.format(raw({ averageMiB: 100, peakMiB: 5000, workloadType: 'worker', sensitivity: 'high' }));
  assert.ok(result.ratio > kubernetes.OVERCOMMIT_RATIO);
  const warning = result.warnings.find((w) => w.code === 'overcommit-risk');
  assert.ok(warning);
  assert.match(warning.message, /evict/);
});

test('carries through the peak-below-average warning from raw sizing', () => {
  const result = kubernetes.format(raw({ averageMiB: 500, peakMiB: 100 }));
  assert.ok(result.warnings.some((w) => w.code === 'peak-below-average'));
});

test('returns domain data only: markers carry roles, not CSS classes', () => {
  const result = kubernetes.format(raw());
  assert.deepEqual(result.markers.map((m) => m.role), ['request', 'limit']);
  assert.ok(result.markers.every((m) => !('className' in m)));
  assert.equal(result.snippet.language, 'yaml');
});
