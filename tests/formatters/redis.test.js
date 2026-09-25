import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as redis from '../../public/js/formatters/redis.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'cache', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact redis.conf lines and runtime command for a known input', () => {
  // 500 × 1.30 = 650 → 704mb
  const result = redis.format(raw());
  assert.equal(result.snippet.code, 'maxmemory 704mb\nmaxmemory-policy allkeys-lru');
  assert.equal(
    result.alternative.code,
    'redis-cli CONFIG SET maxmemory 704mb && redis-cli CONFIG SET maxmemory-policy allkeys-lru && redis-cli CONFIG REWRITE'
  );
});

test('provisions 2× maxmemory for persistence forks', () => {
  const result = redis.format(raw());
  assert.equal(result.provision, result.maxmemory * 2);
});

test('maxmemory never drops below the average-based figure for steady caches', () => {
  const input = raw({ averageMiB: 1000, peakMiB: 1000, sensitivity: 'high' });
  const result = redis.format(input);
  assert.ok(result.maxmemory >= input.requestMiB);
  assert.equal(result.maxmemory % 64, 0);
});

test('explains eviction policy choice and host headroom', () => {
  const { note } = redis.format(raw());
  assert.match(note, /noeviction/);
  assert.match(note, /1\.25× maxmemory/);
});
