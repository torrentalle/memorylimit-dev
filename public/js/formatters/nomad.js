/**
 * Raw MiB sizing → a HashiCorp Nomad task `resources` block.
 *
 * Nomad's own guidance matches the shared model: `memory` for the task's
 * typical usage (the reservation the scheduler places tasks by) and, with
 * memory oversubscription enabled, `memory_max` for unexpected spikes (the
 * hard limit). Nomad's "MB" is MiB, so values pass through unconverted and
 * round up to a whole MB. Nomad rejects `memory` below 10 MB and
 * `memory_max` below `memory`, so each is raised to that floor if needed.
 *
 * The method, sources and assumptions are on /nomad/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent, pluralize } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'memory is this plus the request margin.',
  peak: 'memory_max is this plus the limit margin, and never below memory.',
  replicas: 'Only the total changes: it’s memory per allocation times this.'
};

// Nomad takes whole MB (MiB).
export const ROUNDING_STEP_MB = 1;
// The smallest memory Nomad accepts for a task.
export const MIN_MEMORY_MB = 10;

const ENABLE_OVERSUBSCRIPTION = 'nomad operator scheduler set-config -memory-oversubscription=true';
const NOTE =
  'memory_max only takes effect when the cluster has memory oversubscription enabled. Without it, Nomad ignores ' +
  'memory_max and enforces memory as the hard limit — in that case set memory to the memory_max value instead.';

export function generateHcl(memory, memoryMax) {
  return ['resources {', `  memory     = ${memory}`, `  memory_max = ${memoryMax}`, '}'].join('\n');
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, memory, memoryMax, totalReserved, memoryRaised, maxRaised) {
  return [
    {
      label: 'memory',
      text: `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)}` +
        (memoryRaised ? `, raised to Nomad’s ${MIN_MEMORY_MB} MB minimum → ${memory} MB` : ` → ${memory} MB`)
    },
    {
      label: 'memory_max',
      text: `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)}` +
        (maxRaised ? `, raised to memory → ${memoryMax} MB` : ` → ${memoryMax} MB`)
    },
    { label: 'Total reserved', text: `${memory} MB × ${pluralize(raw.replicas, 'allocation')} = ${totalReserved} MB` }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const averageBased = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MB);
  const memory = Math.max(averageBased, MIN_MEMORY_MB);
  const peakBased = roundUpToMultiple(raw.limitMiB, ROUNDING_STEP_MB);
  // Nomad rejects memory_max below memory.
  const memoryMax = Math.max(peakBased, memory);
  const totalReserved = memory * raw.replicas;

  const steps = explainSteps(raw, memory, memoryMax, totalReserved, memory > averageBased, memoryMax > peakBased);
  return {
    platform: 'nomad',
    memory,
    memoryMax,
    totalReserved,
    figures: [
      { role: 'request', label: 'memory', text: `${memory} MB`, detail: 'reserved per task' },
      { role: 'limit', label: 'memory_max', text: `${memoryMax} MB`, detail: 'hard limit per task' },
      { role: 'total', label: 'Total reserved', text: `${totalReserved} MB`, detail: `across ${pluralize(raw.replicas, 'allocation')}` }
    ],
    markers: [
      { role: 'request', name: 'memory', value: memory, text: `${memory} MB` },
      { role: 'limit', name: 'memory_max', value: memoryMax, text: `${memoryMax} MB` }
    ],
    snippet: { label: 'Nomad job (task resources)', language: 'hcl', code: generateHcl(memory, memoryMax) },
    alternative: { label: 'Enable oversubscription once per cluster', code: ENABLE_OVERSUBSCRIPTION },
    warnings: [...raw.warnings],
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
