import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as dockerCompose from '../../public/js/formatters/docker-compose.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('rounds reservation and limit up to a whole M and no further', () => {
  const input = raw({ averageMiB: 401, peakMiB: 601 });
  const result = dockerCompose.format(input);
  assert.equal(result.reservation, Math.ceil(input.requestMiB));
  assert.equal(result.limit, Math.ceil(input.limitMiB));
});

test('produces a deploy.resources block', () => {
  const result = dockerCompose.format(raw());
  assert.equal(
    result.snippet.code,
    'deploy:\n  resources:\n    limits:\n      memory: 650M\n    reservations:\n      memory: 520M'
  );
});

test('offers the service-level mem_limit / mem_reservation equivalent', () => {
  const result = dockerCompose.format(raw());
  assert.equal(result.alternative.code, 'mem_limit: 650M\nmem_reservation: 520M');
  assert.match(result.alternative.label, /^Service-level equivalent/);
});

test('never emits a reservation above the limit for steady workloads', () => {
  for (const [workloadType, sensitivity, averageMiB, peakMiB] of [
    ['generic', 'high', 1000, 1050],
    ['cache', 'medium', 1000, 1020],
    ['cache', 'high', 800, 800]
  ]) {
    const result = dockerCompose.format(raw({ workloadType, sensitivity, averageMiB, peakMiB }));
    assert.ok(result.limit >= result.reservation, `${workloadType}/${sensitivity}: ${result.reservation}M > ${result.limit}M`);
    assert.ok(result.warnings.some((w) => w.code === 'limit-raised-to-reservation'));
    assert.match(result.explanationSteps[1].text, /raised to the reservation/);
  }
});

test('does not warn about the limit when peak leaves enough headroom', () => {
  const result = dockerCompose.format(raw());
  assert.ok(!result.warnings.some((w) => w.code === 'limit-raised-to-reservation'));
});

test('never emits a limit below Docker’s 6M minimum', () => {
  const result = dockerCompose.format(raw({ averageMiB: 2, peakMiB: 3 }));
  assert.equal(result.limit, dockerCompose.MIN_LIMIT_MIB);
  assert.match(result.explanationSteps[1].text, /raised to Docker’s 6M minimum → 6M$/);
});

test('totalReservation multiplies reservation by replica count', () => {
  const result = dockerCompose.format(raw({ replicas: 4 }));
  assert.equal(result.totalReservation, result.reservation * 4);
});

test('explains the derivation in three short steps with the real numbers', () => {
  const result = dockerCompose.format(raw({ averageMiB: 410, peakMiB: 630, replicas: 3 }));
  assert.deepEqual(result.explanationSteps, [
    { label: 'Reservation', text: '410 MiB average + 30% = 533 MiB → 533M' },
    { label: 'Limit', text: '630 MiB peak + 30% = 819 MiB → 819M' },
    { label: 'Total reservation', text: '533M × 3 replicas = 1599M' }
  ]);
});

test('the note stays within three short sentences and covers the soft reservation and swap', () => {
  const { note } = dockerCompose.format(raw());
  assert.ok(note.split(/(?<=\.) /).length <= 3);
  assert.match(note, /soft limit/);
  assert.match(note, /memswap_limit/);
});

test('carries through the peak-below-average warning from raw sizing', () => {
  const result = dockerCompose.format(raw({ averageMiB: 500, peakMiB: 100 }));
  assert.ok(result.warnings.some((w) => w.code === 'peak-below-average'));
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'docker-compose', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment, replicas] = example.split(' ');
    const input = { averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment, replicas: Number(replicas) };
    const result = dockerCompose.format(calculateRawSizing(input));
    const expected = { reservation: `${result.reservation}M`, limit: `${result.limit}M`, totalReservation: `${result.totalReservation}M` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites Docker’s documentation and source for each rule', () => {
  for (const url of [
    'https://docs.docker.com/reference/compose-file/deploy/',
    'https://docs.docker.com/engine/containers/resource_constraints/',
    'https://github.com/moby/moby/blob/master/daemon/daemon_unix.go'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
