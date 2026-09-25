/**
 * Raw MiB sizing → a systemd unit drop-in with MemoryHigh / MemoryMax, for
 * services running directly on a VM or bare-metal host.
 *
 * systemd treats MemoryHigh as the main control and MemoryMax as the last
 * line of defense, so:
 *   MemoryHigh — just above the observed peak (peak + limit margin). Normal
 *                peaks run unthrottled; throttling and aggressive reclaim
 *                only start when usage grows past anything seen so far.
 *   MemoryMax  — 1.2× MemoryHigh. The gap is warning time: a leak slows the
 *                service down before the kernel OOM-kills it.
 * The average-based request has nothing to reserve without a scheduler, so
 * it's reported as "expected usage" only.
 *
 * systemd reads K/M/G suffixes as base-1024, so `M` here means MiB.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent } from './shared.js';

export const HIGH_STEP_MIB = 32;
export const MAX_STEP_MIB = 64;
export const MAX_TO_HIGH_RATIO = 1.2;

const INSTALL_INSTRUCTIONS =
  'Save as /etc/systemd/system/<service>.service.d/override.conf, then run: ' +
  'systemctl daemon-reload && systemctl restart <service>';

const THROTTLING_NOTE =
  'MemoryHigh sits just above your observed peak, so the service is only throttled once usage grows past anything ' +
  'seen so far — typically a leak — and the gap up to MemoryMax is your warning time before an OOM kill. Both ' +
  'settings need cgroup v2 (the default on current distributions); on cgroup v1 hosts use MemoryLimit= instead.';

export function generateDropIn(memoryHigh, memoryMax) {
  return ['[Service]', `MemoryHigh=${memoryHigh}M`, `MemoryMax=${memoryMax}M`].join('\n');
}

function explain(raw, expectedUsage, memoryHigh, memoryMax) {
  return (
    `MemoryHigh = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin ` +
    `(${describeProfile(raw)}) → rounded up to ${memoryHigh}M; ` +
    `MemoryMax = ${MAX_TO_HIGH_RATIO}× MemoryHigh → rounded up to ${memoryMax}M. ` +
    `Expected usage (not enforced) = ${Math.round(raw.averageMiB)}MiB average + ${percent(raw.requestMarginPct)} ` +
    `margin → ${expectedUsage}M.`
  );
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const expectedUsage = roundUpToMultiple(raw.requestMiB, HIGH_STEP_MIB);
  // Never throttle below expected usage, even when peak ≈ average.
  const memoryHigh = roundUpToMultiple(Math.max(raw.limitMiB, raw.requestMiB), HIGH_STEP_MIB);
  const memoryMax = roundUpToMultiple(memoryHigh * MAX_TO_HIGH_RATIO, MAX_STEP_MIB);

  return {
    platform: 'systemd',
    expectedUsage,
    memoryHigh,
    memoryMax,
    figures: [
      { role: 'request', label: 'Expected usage', text: `${expectedUsage}M`, detail: 'reference only — not enforced' },
      { role: 'request', label: 'MemoryHigh', text: `${memoryHigh}M`, detail: 'throttled above this' },
      { role: 'limit', label: 'MemoryMax', text: `${memoryMax}M`, detail: 'OOM-killed above this' }
    ],
    markers: [
      { role: 'request', name: 'high', value: memoryHigh, text: `${memoryHigh}M` },
      { role: 'limit', name: 'max', value: memoryMax, text: `${memoryMax}M` }
    ],
    snippet: { label: 'systemd drop-in (override.conf)', language: 'ini', code: generateDropIn(memoryHigh, memoryMax) },
    alternative: { label: 'Install', code: INSTALL_INSTRUCTIONS },
    warnings: [...raw.warnings],
    explanation: explain(raw, expectedUsage, memoryHigh, memoryMax),
    note: THROTTLING_NOTE
  };
}
