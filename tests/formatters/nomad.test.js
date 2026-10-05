import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as nomad from '../../public/js/formatters/nomad.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact resources block for a known input', () => {
  const result = nomad.format(raw({ averageMiB: 450.4, peakMiB: 629.4, replicas: 3 }));
  assert.equal(result.snippet.code, 'resources {\n  memory     = 586\n  memory_max = 819\n}');
  assert.equal(result.totalReserved, 1758);
});

test('memory and memory_max round up to a whole MB and no further', () => {
  const input = raw({ averageMiB: 401, peakMiB: 601 });
  const result = nomad.format(input);
  assert.equal(result.memory, Math.ceil(input.requestMiB));
  assert.equal(result.memoryMax, Math.ceil(input.limitMiB));
});

test('memory_max is never below memory (Nomad rejects it)', () => {
  const result = nomad.format(raw({ averageMiB: 1000, peakMiB: 1010, sensitivity: 'high' }));
  assert.equal(result.memoryMax, result.memory);
  assert.equal(result.explanationSteps[1].text, '1010 MiB peak + 40% = 1414 MiB, raised to memory → 1500 MB');
});

test('memory is never below Nomad’s 10 MB minimum', () => {
  const result = nomad.format(raw({ averageMiB: 2, peakMiB: 3 }));
  assert.equal(result.memory, nomad.MIN_MEMORY_MB);
  assert.ok(result.memoryMax >= result.memory);
  assert.match(result.explanationSteps[0].text, /raised to Nomad’s 10 MB minimum → 10 MB$/);
});

test('explains the derivation in three short steps with the real numbers', () => {
  const result = nomad.format(raw({ averageMiB: 410, peakMiB: 630, replicas: 3 }));
  assert.deepEqual(result.explanationSteps, [
    { label: 'memory', text: '410 MiB average + 30% = 533 MiB → 533 MB' },
    { label: 'memory_max', text: '630 MiB peak + 30% = 819 MiB → 819 MB' },
    { label: 'Total reserved', text: '533 MB × 3 allocations = 1599 MB' }
  ]);
});

test('explains that memory_max needs oversubscription enabled, with the command', () => {
  const result = nomad.format(raw());
  assert.equal(result.alternative.code, 'nomad operator scheduler set-config -memory-oversubscription=true');
  assert.match(result.note, /memory oversubscription enabled/);
  assert.ok(result.note.split(/(?<=\.) /).length <= 3);
});

test('gauge markers are labelled memory / memory_max', () => {
  assert.deepEqual(nomad.format(raw()).markers.map((m) => m.name), ['memory', 'memory_max']);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'nomad', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment, replicas] = example.split(' ');
    const input = { averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment, replicas: Number(replicas) };
    const result = nomad.format(calculateRawSizing(input));
    const expected = { memory: `${result.memory} MB`, memoryMax: `${result.memoryMax} MB`, totalReserved: `${result.totalReserved} MB` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites HashiCorp’s documentation and Nomad’s source', () => {
  for (const url of [
    'https://developer.hashicorp.com/nomad/docs/job-specification/resources',
    'https://developer.hashicorp.com/nomad/commands/operator/scheduler/set-config',
    'https://github.com/hashicorp/nomad/blob/main/nomad/structs/structs.go'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
