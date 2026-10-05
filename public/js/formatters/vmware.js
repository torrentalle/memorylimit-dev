/**
 * Raw MiB sizing → a VMware vSphere VM's memory size, reservation and shares,
 * following VMware's own advice, as vSphere Client steps and the equivalent
 * govc command.
 *
 *   Memory      — peak-based, rounded up to a whole MB: the VM's configured
 *                 memory. With no limit set, it is the VM's effective cap.
 *   Reservation — average-based, rounded up to a whole MB: the memory the VM
 *                 needs under normal load, guaranteed by the host.
 *   Limit       — Unlimited (-1). VMware warns that a limit can waste idle
 *                 memory; the configured memory caps the VM instead.
 *   Shares      — Normal (10 shares per MB); informational only.
 *
 * vSphere labels memory in "MB" and means MiB, so values pass through
 * unconverted. A reservation can't be larger than the configured memory, so
 * the memory is raised to the reservation when steady workloads would invert
 * them.
 *
 * The method, sources and assumptions are on /vmware/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'The reservation is this plus the request margin.',
  peak: 'The VM’s memory size is this plus the limit margin, raised to the reservation if it would fall below it.'
};

// vSphere takes whole MB (MiB).
export const ROUNDING_STEP_MB = 1;
export const DEFAULT_SHARES = 'Normal';
// The API's value for "no limit": the configured memory caps the VM.
export const UNLIMITED = -1;

const NOTE =
  'As VMware advises, no limit is set: with none, the VM’s configured memory is its cap, and no idle host memory is ' +
  'held back by a limit. Raising the memory of a running VM needs memory hot add; lowering it ' +
  'needs the VM powered off. Leave at least 10% of the host unreserved, and keep shares at Normal unless one VM ' +
  'should win under contention.';

export function uiInstructions(memory, reservation) {
  return (
    `Edit Settings → Virtual Hardware → Memory → set Memory to ${memory} MB, Reservation to ${reservation} MB, ` +
    `Limit to Unlimited, Shares to ${DEFAULT_SHARES}.`
  );
}

export function govcCommand(memory, reservation) {
  return (
    `govc vm.change -vm "<vm-name>" -m ${memory} -mem.reservation ${reservation} -mem.limit ${UNLIMITED} ` +
    `-mem.shares ${DEFAULT_SHARES.toLowerCase()}`
  );
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, memory, reservation, memoryRaised) {
  return [
    {
      label: 'Memory',
      text: memoryRaised
        ? `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)}, raised to the reservation → ${memory} MB`
        : `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)} → ${memory} MB`
    },
    { label: 'Reservation', text: `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)} → ${reservation} MB` },
    { label: 'Limit', text: 'Unlimited, so the configured memory is the cap' }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const reservation = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MB);
  const peakBasedMemory = roundUpToMultiple(raw.limitMiB, ROUNDING_STEP_MB);
  // A reservation can't be larger than the VM's configured memory.
  const memory = Math.max(peakBasedMemory, reservation);
  const memoryRaised = memory > peakBasedMemory;

  const warnings = [...raw.warnings];
  if (memoryRaised) {
    warnings.push({
      level: 'warning',
      code: 'memory-raised-to-reservation',
      message:
        `Peak is close to average, so the peak-based memory (${peakBasedMemory} MB) fell below the reservation. ` +
        `The memory was raised to ${memory} MB because a reservation can't be larger than the VM's configured memory.`
    });
  }

  const steps = explainSteps(raw, memory, reservation, memoryRaised);
  return {
    platform: 'vmware',
    memory,
    reservation,
    limit: UNLIMITED,
    shares: DEFAULT_SHARES,
    figures: [
      { role: 'limit', label: 'Memory', text: `${memory} MB`, detail: 'configured size — the cap, with no limit' },
      { role: 'request', label: 'Reservation', text: `${reservation} MB`, detail: 'guaranteed by the host' },
      { role: 'info', label: 'Limit', text: 'Unlimited', detail: 'as VMware advises' },
      { role: 'info', label: 'Shares', text: DEFAULT_SHARES, detail: '10 shares per MB — informational' }
    ],
    markers: [
      { role: 'request', name: 'reservation', value: reservation, text: `${reservation} MB` },
      { role: 'limit', name: 'memory', value: memory, text: `${memory} MB` }
    ],
    snippet: { label: 'govc command', language: 'shell', code: govcCommand(memory, reservation) },
    alternative: { label: 'In vSphere Client', code: uiInstructions(memory, reservation) },
    warnings,
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
