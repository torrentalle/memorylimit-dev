import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as lambda from '../../public/js/formatters/lambda.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('recommendation is peak-based, not average-based', () => {
  // 500 MiB × 1.30 = 650 MiB = 681.6 MB
  assert.equal(lambda.format(raw({ averageMiB: 50, peakMiB: 500 })).memorySize, 682);
});

test('converts MiB to Lambda’s decimal MB and rounds up to a whole MB', () => {
  assert.equal(lambda.mibToMb(1), 1.048576);
  const input = raw({ peakMiB: 501 });
  assert.equal(lambda.format(input).memorySize, Math.ceil(input.limitMiB * 1.048576));
});

test('clamps extremely small results up to 128 MB and warns', () => {
  const result = lambda.format(raw({ averageMiB: 10, peakMiB: 50, sensitivity: 'low' }));
  assert.equal(result.memorySize, 128);
  assert.ok(result.warnings.some((w) => w.code === 'lambda-range-clamped'));
  assert.match(result.explanationSteps[0].text, /kept within Lambda’s 128–10240 MB → 128 MB$/);
});

test('clamps extremely large results down to 10240 MB and warns', () => {
  const result = lambda.format(raw({ averageMiB: 5000, peakMiB: 20000, workloadType: 'worker', sensitivity: 'high' }));
  assert.equal(result.memorySize, 10240);
  assert.ok(result.warnings.some((w) => w.code === 'lambda-range-clamped'));
});

test('does not warn when the result is comfortably within range', () => {
  assert.ok(!lambda.format(raw()).warnings.some((w) => w.code === 'lambda-range-clamped'));
});

test('explains the derivation in short steps with the real numbers, CPU included', () => {
  const result = lambda.format(raw({ averageMiB: 450, peakMiB: 630 }));
  assert.deepEqual(result.explanationSteps, [
    { label: 'Memory', text: '630 MiB peak + 30% = 819 MiB = 858.8 MB → 859 MB' },
    { label: 'CPU', text: '859 MB ÷ 1769 MB per vCPU ≈ 0.49 vCPU' }
  ]);
  assert.equal(result.vcpu, 0.49);
});

test('produces a MemorySize JSON snippet and an AWS CLI command naming the function', () => {
  const { code } = lambda.format(raw()).snippet;
  assert.match(code, /\{ "MemorySize": 682 \}/);
  assert.match(code, /aws lambda update-function-configuration --function-name <function> --memory-size 682$/);
});

test('gauge markers show the peak and the recommended memory, both in MiB', () => {
  const { markers, memorySize } = lambda.format(raw());
  assert.deepEqual(markers.map((m) => m.role), ['peak', 'limit']);
  assert.equal(markers[1].value, (memorySize * 1e6) / 1048576);
});

test('the note covers CPU, cost and AWS’s own tuning tools within three sentences', () => {
  const { note } = lambda.format(raw());
  assert.ok(note.split(/(?<=\.) /).length <= 3);
  assert.match(note, /1,769 MB/);
  assert.match(note, /Power Tuning/);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'lambda', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = example.split(' ');
    const input = { averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment };
    const result = lambda.format(calculateRawSizing(input));
    const expected = { memorySize: `${result.memorySize} MB`, vcpu: `≈ ${result.vcpu} vCPU` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 1, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites the AWS documentation', () => {
  for (const url of [
    'https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html',
    'https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
