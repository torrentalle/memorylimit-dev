/**
 * Raw MiB sizing → a HashiCorp Nomad task `resources` block.
 *
 * With memory oversubscription enabled, `memory` is the reservation the
 * scheduler places tasks by and `memory_max` the hard limit — the same model
 * as Kubernetes requests/limits, so the same rounding applies: memory rounds
 * up to 32 MB, memory_max to 64 MB and never below 1.2× memory. Nomad's "MB"
 * is MiB, so values pass through unconverted.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent, pluralize } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'memory is this plus the request margin.',
  peak: 'memory_max is this plus the limit margin, and at least 1.2× memory.',
  replicas: 'Only the total changes: it’s memory per allocation times this.'
};

export const MEMORY_STEP_MB = 32;
export const MEMORY_MAX_STEP_MB = 64;
export const MIN_MAX_TO_MEMORY_RATIO = 1.2;

const ENABLE_OVERSUBSCRIPTION = 'nomad operator scheduler set-config -memory-oversubscription=true';

const NOTE =
  'memory_max only takes effect when the cluster has memory oversubscription enabled. Without it, Nomad ignores ' +
  'memory_max and enforces memory as the hard limit — in that case set memory to the memory_max value instead.';

export function generateHcl(memory, memoryMax) {
  return ['resources {', `  memory     = ${memory}`, `  memory_max = ${memoryMax}`, '}'].join('\n');
}

function explain(raw, memory, memoryMax) {
  return (
    `memory = ${Math.round(raw.averageMiB)}MiB average + ${percent(raw.requestMarginPct)} margin ` +
    `(${describeProfile(raw)}) → rounded up to ${memory} MB; ` +
    `memory_max = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin, ` +
    `never below ${MIN_MAX_TO_MEMORY_RATIO}× memory → rounded up to ${memoryMax} MB.`
  );
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const memory = roundUpToMultiple(raw.requestMiB, MEMORY_STEP_MB);
  const memoryMax = roundUpToMultiple(Math.max(raw.limitMiB, memory * MIN_MAX_TO_MEMORY_RATIO), MEMORY_MAX_STEP_MB);
  const totalReserved = memory * raw.replicas;

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
    explanation: explain(raw, memory, memoryMax),
    note: NOTE
  };
}
