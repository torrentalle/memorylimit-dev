/**
 * Raw MiB sizing → Proxmox VE VM memory and ballooning minimum.
 *
 *   Minimum memory (`balloon`) — average-based, rounded up to 128 MiB: always
 *                                available to the VM.
 *   Memory (`memory`)          — peak-based, rounded up to 256 MiB: the most
 *                                the guest can grow to while the host has room.
 *
 * Proxmox rejects a minimum above the maximum, so memory is raised to the
 * minimum when steady workloads would invert them. Both are in MiB.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent } from './shared.js';

export const BALLOON_STEP_MIB = 128;
export const MEMORY_STEP_MIB = 256;

const NOTE =
  'Proxmox only grows a VM above its minimum while host RAM usage is below the auto-ballooning target (80% by ' +
  'default) and reclaims it back toward the minimum when the host gets busier. Linux guests ship the balloon ' +
  'driver; Windows guests need the VirtIO balloon driver installed. Leave about 1 GB of RAM for the host itself.';

export function qmCommand(memory, balloon) {
  return `qm set <vmid> --memory ${memory} --balloon ${balloon}`;
}

export function uiInstructions(memory, balloon) {
  return (
    `VM → Hardware → Memory → Edit → tick Advanced → Memory (MiB): ${memory}, ` +
    `Minimum memory (MiB): ${balloon}, Ballooning Device: on.`
  );
}

function explain(raw, balloon, memory, memoryRaised) {
  return (
    `Minimum memory = ${Math.round(raw.averageMiB)}MiB average + ${percent(raw.requestMarginPct)} margin ` +
    `(${describeProfile(raw)}) → rounded up to ${balloon} MiB; ` +
    `memory = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin` +
    (memoryRaised ? `, raised to match the minimum → ${memory} MiB.` : ` → rounded up to ${memory} MiB.`)
  );
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const balloon = roundUpToMultiple(raw.requestMiB, BALLOON_STEP_MIB);
  const peakBasedMemory = roundUpToMultiple(raw.limitMiB, MEMORY_STEP_MIB);
  const memory = Math.max(peakBasedMemory, roundUpToMultiple(balloon, MEMORY_STEP_MIB));
  const memoryRaised = memory > peakBasedMemory;

  const warnings = [...raw.warnings];
  if (memoryRaised) {
    warnings.push({
      level: 'warning',
      code: 'memory-raised-to-minimum',
      message:
        `Peak is close to average, so the peak-based memory (${peakBasedMemory} MiB) fell below the minimum. ` +
        `Memory was raised to ${memory} MiB because Proxmox rejects a minimum above the maximum.`
    });
  }

  return {
    platform: 'proxmox',
    balloon,
    memory,
    figures: [
      { role: 'request', label: 'Minimum memory', text: `${balloon} MiB`, detail: 'balloon — always available' },
      { role: 'limit', label: 'Memory', text: `${memory} MiB`, detail: 'maximum the guest can grow to' }
    ],
    markers: [
      { role: 'request', name: 'minimum', value: balloon, text: `${balloon} MiB` },
      { role: 'limit', name: 'memory', value: memory, text: `${memory} MiB` }
    ],
    snippet: { label: 'qm command', language: 'shell', code: qmCommand(memory, balloon) },
    alternative: { label: 'In the web UI', code: uiInstructions(memory, balloon) },
    warnings,
    explanation: explain(raw, balloon, memory, memoryRaised),
    note: NOTE
  };
}
