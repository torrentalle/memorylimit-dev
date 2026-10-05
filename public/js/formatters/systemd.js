/**
 * Raw MiB sizing → a systemd unit drop-in with MemoryHigh / MemoryMax, for
 * services running directly on a VM or bare-metal host.
 *
 * systemd's documentation recommends MemoryHigh as the main control and
 * MemoryMax as the last line of defense, so:
 *   MemoryHigh — just above the observed peak (peak + limit margin). Normal
 *                peaks run unthrottled; throttling and aggressive reclaim
 *                only start when usage grows past anything seen so far.
 *   MemoryMax  — 1.25× MemoryHigh, so MemoryHigh sits 20% below it (our choice,
 *                at the low end of the 20–30% gap guides suggest). The gap is warning time: a
 *                leak slows the service down before the kernel OOM-kills it.
 * The average-based request has nothing to reserve without a scheduler, so
 * it's reported as "expected usage" only, and MemoryHigh never goes below it.
 *
 * systemd reads K/M/G suffixes as base-1024, so `M` here means MiB; values
 * round up to a whole M.
 *
 * The method, sources and assumptions are on /systemd/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { marginTip, percent } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'Only sets Expected usage, which isn’t enforced, and keeps MemoryHigh from going below it.',
  peak: 'MemoryHigh is this plus the limit margin, and MemoryMax 1.25× MemoryHigh.',
  requestMargin: marginTip('expected usage is the average plus it, and MemoryHigh never goes below that'),
  limitMargin: marginTip('MemoryHigh is the peak plus it')
};

// systemd's M is MiB; the drop-in uses whole M.
export const ROUNDING_STEP_MIB = 1;
export const MAX_TO_HIGH_RATIO = 1.25;

const INSTALL_INSTRUCTIONS = [
  'Save as /etc/systemd/system/<service>.service.d/override.conf, then run:',
  'systemctl daemon-reload && systemctl restart <service>'
];

const THROTTLING_NOTE =
  'MemoryHigh sits just above your observed peak, so the service is only throttled once usage grows past anything ' +
  'seen so far — typically a leak — and the gap up to MemoryMax is your warning time before an OOM kill. Both ' +
  'settings need cgroup v2, the only hierarchy since systemd 258; older hosts still on cgroup v1 have only the ' +
  'deprecated MemoryLimit=.';

export function generateDropIn(memoryHigh, memoryMax) {
  return ['[Service]', `MemoryHigh=${memoryHigh}M`, `MemoryMax=${memoryMax}M`].join('\n');
}

export function setPropertyCommand(memoryHigh, memoryMax) {
  return `systemctl set-property <service>.service MemoryHigh=${memoryHigh}M MemoryMax=${memoryMax}M`;
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, expectedUsage, memoryHigh, memoryMax, highRaised) {
  return [
    {
      label: 'MemoryHigh',
      text: highRaised
        ? `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)}, raised to expected usage → ${memoryHigh}M`
        : `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)} → ${memoryHigh}M`
    },
    { label: 'MemoryMax', text: `${MAX_TO_HIGH_RATIO} × ${memoryHigh}M = ${mib(memoryHigh * MAX_TO_HIGH_RATIO)} → ${memoryMax}M` },
    { label: 'Expected usage', text: `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)} → ${expectedUsage}M, not enforced` }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const expectedUsage = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MIB);
  // Never throttle below expected usage, even when peak ≈ average.
  const highRaised = raw.requestMiB > raw.limitMiB;
  const memoryHigh = roundUpToMultiple(Math.max(raw.limitMiB, raw.requestMiB), ROUNDING_STEP_MIB);
  const memoryMax = roundUpToMultiple(memoryHigh * MAX_TO_HIGH_RATIO, ROUNDING_STEP_MIB);

  const steps = explainSteps(raw, expectedUsage, memoryHigh, memoryMax, highRaised);
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
    alternative: {
      label: 'Install',
      code: [...INSTALL_INSTRUCTIONS, 'Or apply it now, without a restart:', setPropertyCommand(memoryHigh, memoryMax)].join('\n')
    },
    warnings: [...raw.warnings],
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: THROTTLING_NOTE
  };
}
