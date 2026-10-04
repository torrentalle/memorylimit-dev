/**
 * Raw MiB sizing → a Google Cloud Run memory limit.
 *
 * Like Lambda, Cloud Run has one memory setting per instance and running
 * out kills the instance, so the size is peak-based. It rounds up to 64 Mi,
 * is clamped to Cloud Run's 128 Mi – 32 Gi range, and larger sizes carry the
 * minimum CPU count Cloud Run requires for them.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent, PEAK_ONLY_FIELD_TIPS } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  ...PEAK_ONLY_FIELD_TIPS,
  peak: 'The memory limit is this plus the limit margin; above 4 GiB it also sets the minimum CPU.'
};

export const STEP_MIB = 64;
export const MIN_MEMORY_MIB = 128;
export const MIN_GEN2_MEMORY_MIB = 512;
export const MAX_MEMORY_MIB = 32768;

// Minimum vCPUs Cloud Run requires for a memory size (in MiB).
const CPU_FOR_MEMORY = [
  { upToMiB: 4096, cpu: 1 },
  { upToMiB: 8192, cpu: 2 },
  { upToMiB: 16384, cpu: 4 },
  { upToMiB: 24576, cpu: 6 },
  { upToMiB: 32768, cpu: 8 }
];

const NOTE =
  'Memory per instance grows with concurrency, so this fits the concurrency your samples were collected under — ' +
  'raise it if you raise concurrency. Files written to the container’s filesystem are held in memory and count ' +
  'against this limit too.';

export function minimumCpu(memoryMiB) {
  return CPU_FOR_MEMORY.find((tier) => memoryMiB <= tier.upToMiB).cpu;
}

export function formatQuantity(memoryMiB) {
  return memoryMiB % 1024 === 0 ? `${memoryMiB / 1024}Gi` : `${memoryMiB}Mi`;
}

export function gcloudCommand(memoryMiB) {
  const cpu = minimumCpu(memoryMiB);
  return `gcloud run services update <service> --memory ${formatQuantity(memoryMiB)}${cpu > 1 ? ` --cpu ${cpu}` : ''}`;
}

function explain(raw, rounded, memory, clamped) {
  const base = `Memory = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin (${describeProfile(raw)})`;
  return clamped
    ? `${base} → ${rounded}Mi, clamped to Cloud Run’s 128Mi–32Gi range → ${formatQuantity(memory)}.`
    : `${base} → rounded up to ${formatQuantity(memory)}.`;
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const rounded = roundUpToMultiple(raw.limitMiB, STEP_MIB);
  const memory = Math.min(MAX_MEMORY_MIB, Math.max(MIN_MEMORY_MIB, rounded));
  const clamped = memory !== rounded;
  const cpu = minimumCpu(memory);

  const warnings = [...raw.warnings];
  if (clamped) {
    warnings.push({
      level: 'warning',
      code: 'cloud-run-range-clamped',
      message: `Calculated memory (${rounded}Mi) is outside Cloud Run’s 128Mi–32Gi range; clamped to ${formatQuantity(memory)}.`
    });
  }
  if (memory < MIN_GEN2_MEMORY_MIB) {
    warnings.push({
      level: 'warning',
      code: 'cloud-run-gen2-minimum',
      message: `${memory}Mi only works in the first-generation execution environment; the second generation needs at least 512Mi.`
    });
  }

  return {
    platform: 'cloudRun',
    memory,
    cpu,
    figures: [
      { role: 'total', label: 'Memory limit', text: formatQuantity(memory), detail: 'per instance' },
      { role: 'info', label: 'Minimum CPU', text: `${cpu} vCPU`, detail: 'required by Cloud Run for this memory size' }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      { role: 'limit', name: 'memory', value: memory, text: formatQuantity(memory) }
    ],
    snippet: { label: 'gcloud command', language: 'shell', code: gcloudCommand(memory) },
    alternative: {
      label: 'service.yaml',
      code: `spec.template.spec.containers[0].resources.limits.memory: ${formatQuantity(memory)}`
    },
    warnings,
    explanation: explain(raw, rounded, memory, clamped),
    note: NOTE
  };
}
