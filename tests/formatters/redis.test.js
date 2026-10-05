import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as redis from '../../public/js/formatters/redis.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'cache', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact redis.conf lines and runtime command for a known input', () => {
  // 500 × 1.30 = 650 → 650mb
  const result = redis.format(raw());
  assert.equal(result.snippet.code, 'maxmemory 650mb\nmaxmemory-policy allkeys-lru');
  assert.equal(
    result.alternative.code,
    'redis-cli CONFIG SET maxmemory 650mb && redis-cli CONFIG SET maxmemory-policy allkeys-lru && redis-cli CONFIG REWRITE'
  );
});

test('maxmemory rounds up to a whole mb and no further', () => {
  const input = raw({ peakMiB: 501 });
  assert.equal(redis.format(input).maxmemory, Math.ceil(input.limitMiB));
});

test('provisions 2× maxmemory for persistence forks', () => {
  const result = redis.format(raw());
  assert.equal(result.provision, result.maxmemory * 2);
});

test('maxmemory never drops below the average-based figure for steady caches, and says so', () => {
  const input = raw({ averageMiB: 1000, peakMiB: 1010, sensitivity: 'high' });
  const result = redis.format(input);
  assert.equal(result.maxmemory, Math.ceil(input.requestMiB));
  assert.equal(result.explanationSteps[0].text, '1000 MiB average + 55% = 1550 MiB, above the peak-based 1414 MiB → 1550mb');
});

test('explains the derivation in two short steps with the real numbers', () => {
  assert.deepEqual(redis.format(raw({ averageMiB: 410, peakMiB: 630 })).explanationSteps, [
    { label: 'maxmemory', text: '630 MiB peak used_memory + 30% = 819 MiB → 819mb' },
    { label: 'Memory to provision', text: '2 × 819 MiB for persistence forks = 1638 MiB' }
  ]);
});

test('the note covers forks, replication, host headroom and the eviction policy within three sentences', () => {
  const { note } = redis.format(raw());
  assert.match(note, /twice its memory/);
  assert.match(note, /diskless/);
  assert.match(note, /1\.25× maxmemory/);
  assert.match(note, /noeviction/);
  assert.ok(note.split(/(?<=\.) /).length <= 3);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'redis', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = example.split(' ');
    const result = redis.format(calculateRawSizing({ averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }));
    const expected = { maxmemory: `${result.maxmemory}mb`, provision: `${result.provision} MiB` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites the Redis documentation', () => {
  for (const url of [
    'https://redis.io/docs/latest/operate/oss_and_stack/management/admin/',
    'https://redis.io/docs/latest/develop/reference/eviction/',
    'https://github.com/redis/redis/blob/unstable/redis.conf'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});

test('the memory to provision follows the provisioning factor, rounded up to a whole MiB', () => {
  // maxmemory 650mb; 1.25 × 650 = 812.5 → 813 MiB
  const result = redis.format(raw(), { provisionFactor: 1.25 });
  assert.equal(result.maxmemory, 650);
  assert.equal(result.provision, 813);
  assert.equal(result.explanationSteps[1].text, '1.25 × 650 MiB, your provisioning factor = 812.5 MiB → 813 MiB');
  assert.throws(() => redis.format(raw(), { provisionFactor: 0.5 }), RangeError);
});
