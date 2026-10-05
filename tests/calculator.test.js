import test from 'node:test';
import assert from 'node:assert/strict';
import * as Calculator from '../public/js/calculator.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => Calculator.calculateRawSizing({ ...BASE, ...overrides });

test('roundUpToMultiple rounds up to the given multiple', () => {
  assert.equal(Calculator.roundUpToMultiple(100, 32), 128);
  assert.equal(Calculator.roundUpToMultiple(128, 32), 128);
  assert.equal(Calculator.roundUpToMultiple(1, 64), 64);
});

test('roundUpToMultiple ignores floating-point noise just above a multiple', () => {
  // 200 × 1.12 === 224.00000000000003 in IEEE 754; it must still round to 224, not 256.
  assert.equal(Calculator.roundUpToMultiple(200 * 1.12, 32), 224);
  const result = raw({ averageMiB: 200, workloadType: 'cache', sensitivity: 'low', environment: 'development' });
  assert.equal(Calculator.roundUpToMultiple(result.requestMiB, 32), 224);
});

test('calculateRawSizing applies no platform-specific rounding', () => {
  const result = raw();
  assert.equal(result.requestMiB, 520);
  assert.equal(result.limitMiB, 650);
});

test('jvm workload adds +15% to request margin and +30% to limit margin', () => {
  const generic = raw();
  const jvm = raw({ workloadType: 'jvm' });
  assert.ok(Math.abs(jvm.requestMarginPct - generic.requestMarginPct - 0.15) < 1e-9);
  assert.ok(Math.abs(jvm.limitMarginPct - generic.limitMarginPct - 0.30) < 1e-9);
});

test('worker workload lowers request margin but raises limit margin (burstiness)', () => {
  const generic = raw({ peakMiB: 900 });
  const worker = raw({ peakMiB: 900, workloadType: 'worker' });
  assert.ok(worker.requestMarginPct < generic.requestMarginPct);
  assert.ok(worker.limitMarginPct > generic.limitMarginPct);
});

test('development environment scales the margin down (×0.6)', () => {
  assert.ok(Math.abs(raw({ environment: 'development' }).requestMarginPct - 0.18) < 1e-9);
});

test('sensitivity=high uses the 50%/40% base margins (generic, production)', () => {
  const result = raw({ sensitivity: 'high' });
  assert.equal(result.requestMarginPct, 0.5);
  assert.equal(result.limitMarginPct, 0.4);
  assert.equal(result.requestMiB, 600);
  assert.equal(result.limitMiB, 700);
});

test('margins increase monotonically from low to high sensitivity', () => {
  const [low, medium, high] = Calculator.SENSITIVITIES.map((sensitivity) => raw({ sensitivity }));
  assert.ok(low.requestMarginPct < medium.requestMarginPct && medium.requestMarginPct < high.requestMarginPct);
  assert.ok(low.limitMarginPct < medium.limitMarginPct && medium.limitMarginPct < high.limitMarginPct);
});

test('warns when peak is below average', () => {
  const result = raw({ averageMiB: 500, peakMiB: 100 });
  assert.ok(result.warnings.some((w) => w.code === 'peak-below-average'));
});

test('optional fields fall back to documented defaults', () => {
  const result = Calculator.calculateRawSizing({ averageMiB: 400, peakMiB: 500 });
  assert.equal(result.workloadType, 'generic');
  assert.equal(result.sensitivity, 'medium');
  assert.equal(result.environment, 'production');
  assert.equal(result.replicas, 1);
});

test('rejects invalid input instead of silently coercing it', () => {
  for (const [overrides, pattern] of [
    [{ averageMiB: 0 }, /averageMiB/],
    [{ averageMiB: -5 }, /averageMiB/],
    [{ peakMiB: Number.NaN }, /peakMiB/],
    [{ peakMiB: '500' }, /peakMiB/],
    [{ sensitivity: 'extreme' }, /sensitivity/],
    [{ workloadType: 'rust' }, /workloadType/],
    [{ environment: 'prod' }, /environment/],
    [{ replicas: 0 }, /replicas/],
    [{ replicas: 2.5 }, /replicas/]
  ]) {
    assert.throws(() => raw(overrides), { name: 'RangeError', message: pattern }, JSON.stringify(overrides));
  }
});

test('a margin override replaces the profile’s margin, which is still reported', () => {
  const result = raw({ workloadType: 'jvm', requestMargin: 0.1, limitMargin: 0 });
  assert.equal(result.requestMarginPct, 0.1);
  assert.equal(result.limitMarginPct, 0);
  assert.ok(Math.abs(result.requestMiB - 440) < 1e-9);
  assert.equal(result.limitMiB, 500);
  assert.ok(Math.abs(result.profileRequestMarginPct - 0.45) < 1e-9);
  assert.ok(Math.abs(result.profileLimitMarginPct - 0.6) < 1e-9);
});

test('without overrides the margins are the profile’s', () => {
  const result = raw();
  assert.equal(result.requestMarginPct, result.profileRequestMarginPct);
  assert.equal(result.limitMarginPct, result.profileLimitMarginPct);
});

test('a margin override must be a non-negative number', () => {
  for (const overrides of [{ requestMargin: -0.1 }, { limitMargin: Number.NaN }, { limitMargin: '0.3' }]) {
    assert.throws(() => raw(overrides), { name: 'RangeError' }, JSON.stringify(overrides));
  }
});
