/**
 * Raw MiB sizing → Proxmox VE VM memory and ballooning minimum.
 *
 *   Minimum memory (`balloon`) — average-based: always available to the VM.
 *   Memory (`memory`)          — peak-based: the most the guest can grow to
 *                                while the host has room.
 *
 * Both are in MiB and round up to a whole MiB. Proxmox rejects a minimum above
 * the maximum, so memory is raised to the minimum when steady workloads would
 * invert them, and memory is at least Proxmox's 16 MiB.
 *
 * The method, sources and assumptions are on /proxmox/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { marginTip, percent } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'Minimum memory (balloon) is this plus the request margin.',
  peak: 'Memory is this plus the limit margin, raised to the minimum if it would fall below it.',
  requestMargin: marginTip('minimum memory (balloon) is the average plus it'),
  limitMargin: marginTip('memory is the peak plus it')
};

// Proxmox takes whole MiB.
export const ROUNDING_STEP_MIB = 1;
// The smallest memory Proxmox accepts for a VM.
export const MIN_MEMORY_MIB = 16;

const NOTE =
  'Proxmox only grows a VM above its minimum while host RAM usage is below the auto-ballooning target (80% by ' +
  'default) and reclaims it back toward the minimum when the host gets busier; leave about 1 GB of RAM for the host ' +
  'itself. Linux guests ship the balloon driver; on Windows it has to be installed, and Proxmox advises against it ' +
  'for critical systems.';

export function qmCommand(memory, balloon) {
  return `qm set <vmid> --memory ${memory} --balloon ${balloon}`;
}

export function uiInstructions(memory, balloon) {
  return (
    `VM → Hardware → Memory → Edit → tick Advanced → Memory (MiB): ${memory}, ` +
    `Minimum memory (MiB): ${balloon}, Ballooning Device: on.`
  );
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, balloon, memory, raisedTo) {
  const fromPeak = `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)}`;
  return [
    { label: 'Minimum memory', text: `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)} → ${balloon} MiB` },
    {
      label: 'Memory',
      text:
        raisedTo === 'minimum'
          ? `${fromPeak}, raised to the minimum → ${memory} MiB`
          : raisedTo === 'floor'
            ? `${fromPeak}, raised to Proxmox’s ${MIN_MEMORY_MIB} MiB → ${memory} MiB`
            : `${fromPeak} → ${memory} MiB`
    }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const balloon = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MIB);
  const peakBasedMemory = roundUpToMultiple(raw.limitMiB, ROUNDING_STEP_MIB);
  // Proxmox rejects a balloon above memory, and memory below 16 MiB.
  const memory = Math.max(peakBasedMemory, balloon, MIN_MEMORY_MIB);
  const raisedTo = memory === peakBasedMemory ? null : memory === balloon ? 'minimum' : 'floor';

  const warnings = [...raw.warnings];
  if (raisedTo === 'minimum') {
    warnings.push({
      level: 'warning',
      code: 'memory-raised-to-minimum',
      message:
        `Peak is close to average, so the peak-based memory (${peakBasedMemory} MiB) fell below the minimum. ` +
        `Memory was raised to ${memory} MiB because Proxmox rejects a minimum above the maximum.`
    });
  }

  const steps = explainSteps(raw, balloon, memory, raisedTo);
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
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
