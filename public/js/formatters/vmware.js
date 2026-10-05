/**
 * Raw MiB sizing → VMware vSphere memory reservation / limit / shares for
 * a VM, as vSphere Client steps and the equivalent govc command.
 *
 *   Reservation — average-based, rounded up to a whole MB: memory the host
 *                 guarantees the VM.
 *   Limit       — peak-based, rounded up to a whole MB: above it the host
 *                 balloons and swaps the VM instead of OOM-killing anything.
 *   Shares      — Normal (10 shares per MB); informational only.
 *
 * vSphere labels memory in "MB" and means MiB, so values pass through
 * unconverted. A VM whose reservation is above its limit can fail to power
 * on, so the limit is raised to the reservation when steady workloads would
 * invert them.
 *
 * VMware's own guidance differs: reserve only the minimum acceptable memory,
 * and avoid limits because they can waste idle memory. The note says so.
 *
 * The method, sources and assumptions are on /vmware/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'The reservation is this plus the request margin.',
  peak: 'The limit is this plus the limit margin, raised to the reservation if it would fall below it.'
};

// vSphere takes whole MB (MiB).
export const ROUNDING_STEP_MB = 1;
export const DEFAULT_SHARES = 'Normal';

const NOTE =
  'A limit below the VM’s configured memory makes the host balloon and swap it rather than fail fast, and VMware ' +
  'warns that limits can waste idle memory: with no limit, the configured memory is the cap. VMware also suggests ' +
  'reserving only the minimum acceptable memory and leaving at least 10% of the host unreserved. Shares stay at ' +
  'Normal; change them only to favour one VM over others under contention.';

export function uiInstructions(reservation, limit) {
  return (
    `Edit Settings → Virtual Hardware → Memory → set Reservation to ${reservation} MB, ` +
    `Limit to ${limit} MB, Shares to ${DEFAULT_SHARES}.`
  );
}

export function govcCommand(reservation, limit) {
  return (
    `govc vm.change -vm "<vm-name>" -mem.reservation ${reservation} -mem.limit ${limit} ` +
    `-mem.shares ${DEFAULT_SHARES.toLowerCase()}`
  );
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, reservation, limit, limitRaised) {
  return [
    { label: 'Reservation', text: `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)} → ${reservation} MB` },
    {
      label: 'Limit',
      text: limitRaised
        ? `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)}, raised to the reservation → ${limit} MB`
        : `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)} → ${limit} MB`
    }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const reservation = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MB);
  const peakBasedLimit = roundUpToMultiple(raw.limitMiB, ROUNDING_STEP_MB);
  const limit = Math.max(peakBasedLimit, reservation);
  const limitRaised = limit > peakBasedLimit;

  const warnings = [...raw.warnings];
  if (limitRaised) {
    warnings.push({
      level: 'warning',
      code: 'limit-raised-to-reservation',
      message:
        `Peak is close to average, so the peak-based limit (${peakBasedLimit} MB) fell below the reservation. ` +
        `The limit was raised to ${limit} MB because a VM whose reservation is above its limit can fail to power on.`
    });
  }

  const steps = explainSteps(raw, reservation, limit, limitRaised);
  return {
    platform: 'vmware',
    reservation,
    limit,
    shares: DEFAULT_SHARES,
    figures: [
      { role: 'request', label: 'Reservation', text: `${reservation} MB`, detail: 'guaranteed, never reclaimed' },
      { role: 'limit', label: 'Limit', text: `${limit} MB`, detail: 'ballooning / swapping above this' },
      { role: 'info', label: 'Shares', text: DEFAULT_SHARES, detail: '10 shares per MB — informational' }
    ],
    markers: [
      { role: 'request', name: 'reservation', value: reservation, text: `${reservation} MB` },
      { role: 'limit', name: 'limit', value: limit, text: `${limit} MB` }
    ],
    snippet: { label: 'govc command', language: 'shell', code: govcCommand(reservation, limit) },
    alternative: { label: 'In vSphere Client', code: uiInstructions(reservation, limit) },
    warnings,
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
