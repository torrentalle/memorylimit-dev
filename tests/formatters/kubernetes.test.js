import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as kubernetes from '../../public/js/formatters/kubernetes.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

// Golden output: pins the exact manifest text for a known input so any
// change to rounding, flooring or YAML formatting shows up as a diff.
test('golden: exact manifest for a known input', () => {
  const result = kubernetes.format(raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 }));
  assert.equal(result.request, 586);
  assert.equal(result.limit, 819);
  assert.equal(result.totalRequest, 1758);
  assert.equal(result.snippet.code, 'resources:\n  requests:\n    memory: "586Mi"\n  limits:\n    memory: "819Mi"');
});

test('request and limit round up to a whole Mi and no further', () => {
  const input = raw({ averageMiB: 401, peakMiB: 601 });
  const result = kubernetes.format(input);
  assert.equal(result.request, Math.ceil(input.requestMiB));
  assert.equal(result.limit, Math.ceil(input.limitMiB));
});

test('burstable limit is never below 1.2× the rounded request', () => {
  const result = kubernetes.format(raw({ averageMiB: 1000, peakMiB: 1010, sensitivity: 'low' }));
  assert.ok(result.limit >= result.request * kubernetes.MIN_LIMIT_TO_REQUEST_RATIO);
});

test('guaranteed QoS sets request equal to limit and covers the peak', () => {
  const input = raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 });
  const result = kubernetes.format(input, { qos: 'guaranteed' });
  assert.equal(result.request, result.limit);
  assert.equal(result.limit, Math.ceil(input.limitMiB));
  assert.equal(result.totalRequest, result.limit * 3);
  assert.match(result.explanation, /Guaranteed QoS/);
  assert.match(result.note, /CPU request equal to its CPU limit/);
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

test('explains the derivation in three short steps with the real numbers', () => {
  const result = kubernetes.format(raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 }));
  assert.deepEqual(result.explanationSteps, [
    { label: 'Request', text: '450.4 MiB average + 30% = 585.5 MiB → 586Mi' },
    { label: 'Limit', text: '629.4 MiB peak + 30% = 818.2 MiB → 819Mi' },
    { label: 'Total request', text: '586Mi × 3 replicas = 1758Mi' }
  ]);
  assert.match(result.explanation, /^Request: 450\.4 MiB average/);
});

test('says when the limit was raised to 1.2× the request', () => {
  const result = kubernetes.format(raw({ averageMiB: 1000, peakMiB: 1010, sensitivity: 'low' }));
  assert.equal(result.limit, Math.ceil(result.request * 1.2));
  assert.match(result.explanationSteps[1].text, /raised to 1\.2× the request → 1380Mi$/);
});

test('the note stays within three short sentences and names the eviction risk and VPA', () => {
  for (const qos of kubernetes.QOS_CLASSES) {
    const { note } = kubernetes.format(raw(), { qos });
    assert.ok(note.split(/(?<=\.) /).length <= 3, qos);
  }
  assert.match(kubernetes.format(raw()).note, /evicted.*Vertical Pod Autoscaler/s);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'kubernetes', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.equal(tables.length, 4);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment, replicas, qos] = example.split(' ');
    const input = { averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment, replicas: Number(replicas) };
    const result = kubernetes.format(calculateRawSizing(input), { qos });
    const expected = { request: `${result.request}Mi`, limit: `${result.limit}Mi`, totalRequest: `${result.totalRequest}Mi`, ratio: `${result.ratio}×` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites the Kubernetes docs, compares with VPA and lists its assumptions', () => {
  for (const url of [
    'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/',
    'https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/',
    'https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/flags.md'
  ]) assert.ok(guide.includes(url), url);
  assert.ok((guide.match(/guide-tag--assumption/g) ?? []).length >= 4);
  assert.ok(guide.includes(`${kubernetes.MIN_LIMIT_TO_REQUEST_RATIO}×`));
  assert.ok(guide.includes(`more than ${kubernetes.OVERCOMMIT_RATIO}× the request`));
  assert.ok(guide.includes('href="/sizing-model/"'));
});

test('Guaranteed explains the limit from whichever value sets it', () => {
  const fromPeak = kubernetes.format(raw({ averageMiB: 410, peakMiB: 630 }), { qos: 'guaranteed' });
  assert.equal(fromPeak.explanationSteps[0].text, '630 MiB peak + 30% = 819 MiB → 819Mi');
  const fromAverage = kubernetes.format(raw({ averageMiB: 1000, peakMiB: 1000, sensitivity: 'high' }), { qos: 'guaranteed' });
  assert.equal(fromAverage.explanationSteps[0].text, '1000 MiB average + 50% = 1500 MiB, above the peak-based 1400 MiB → 1500Mi');
});
