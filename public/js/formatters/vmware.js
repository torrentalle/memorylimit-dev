/**
 * Raw MiB sizing → VMware vSphere memory reservation / limit / shares for
 * a VM, as vSphere Client steps and the equivalent govc command.
 *
 *   Reservation — average-based, rounded up to 128 MB: memory the host
 *                 guarantees the VM and never reclaims.
 *   Limit       — peak-based, rounded up to 256 MB: above it the hypervisor
 *                 balloons and swaps the VM instead of OOM-killing anything.
 *   Shares      — always "Normal" (the vSphere default); informational only.
 *
 * vSphere labels memory in "MB" but means MiB, so values pass through
 * unconverted. vSphere rejects a reservation above the limit, so the limit
 * is raised to the reservation when steady workloads would invert them.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent } from './shared.js';

export const RESERVATION_STEP_MB = 128;
export const LIMIT_STEP_MB = 256;
export const DEFAULT_SHARES = 'Normal';

const NOTE =
  'Setting a memory limit below the VM’s configured memory size triggers ballooning/swapping rather than an ' +
  'OOM-kill — this can degrade performance gradually instead of failing fast. Consider this when choosing an ' +
  'aggressive limit. Shares stay at Normal, the vSphere default; change them only to prioritize or deprioritize ' +
  'this VM against others competing for the same host’s memory under contention.';

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

function explain(raw, reservation, limit, limitRaised) {
  return (
    `Reservation = ${Math.round(raw.averageMiB)}MiB average + ${percent(raw.requestMarginPct)} margin ` +
    `(${describeProfile(raw)}) → rounded up to ${reservation} MB; ` +
    `limit = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin` +
    (limitRaised ? `, raised to match the reservation → ${limit} MB.` : ` → rounded up to ${limit} MB.`)
  );
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const reservation = roundUpToMultiple(raw.requestMiB, RESERVATION_STEP_MB);
  const peakBasedLimit = roundUpToMultiple(raw.limitMiB, LIMIT_STEP_MB);
  const limit = Math.max(peakBasedLimit, roundUpToMultiple(reservation, LIMIT_STEP_MB));
  const limitRaised = limit > peakBasedLimit;

  const warnings = [...raw.warnings];
  if (limitRaised) {
    warnings.push({
      level: 'warning',
      code: 'limit-raised-to-reservation',
      message:
        `Peak is close to average, so the peak-based limit (${peakBasedLimit} MB) fell below the reservation. ` +
        `The limit was raised to ${limit} MB because vSphere rejects a reservation above the limit.`
    });
  }

  return {
    platform: 'vmware',
    reservation,
    limit,
    shares: DEFAULT_SHARES,
    figures: [
      { role: 'request', label: 'Reservation', text: `${reservation} MB`, detail: 'guaranteed, never reclaimed' },
      { role: 'limit', label: 'Limit', text: `${limit} MB`, detail: 'ballooning / swapping above this' },
      { role: 'info', label: 'Shares', text: DEFAULT_SHARES, detail: 'vSphere default — informational' }
    ],
    markers: [
      { role: 'request', name: 'reservation', value: reservation, text: `${reservation} MB` },
      { role: 'limit', name: 'limit', value: limit, text: `${limit} MB` }
    ],
    snippet: { label: 'govc command', language: 'shell', code: govcCommand(reservation, limit) },
    alternative: { label: 'In vSphere Client', code: uiInstructions(reservation, limit) },
    warnings,
    explanation: explain(raw, reservation, limit, limitRaised),
    note: NOTE
  };
}
