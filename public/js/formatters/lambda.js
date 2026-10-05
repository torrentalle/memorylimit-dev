/**
 * Raw MiB sizing → a single AWS Lambda MemorySize.
 *
 * Lambda has no separate request/limit: one allocation sets memory,
 * proportional vCPU and per-millisecond cost. Running out causes a hard
 * failure rather than throttling, so the size is peak-based (using the same
 * limit margin as the dual-value platforms), not average-based.
 *
 * Lambda's MB are decimal megabytes (AWS's own Logs Insights queries divide
 * the byte counts by 1000 × 1000), so the MiB result is converted to MB and
 * rounded up to a whole MB, then kept within Lambda's 128–10,240 MB range.
 *
 * The method, sources and assumptions are on /lambda/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent, PEAK_ONLY_FIELD_TIPS } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  ...PEAK_ONLY_FIELD_TIPS,
  peak: 'MemorySize is this plus the limit margin, converted to MB.'
};

export const BYTES_PER_MIB = 1024 * 1024;
export const BYTES_PER_MB = 1000 * 1000;
export const ROUNDING_STEP_MB = 1;
export const MIN_MEMORY_MB = 128;
export const MAX_MEMORY_MB = 10240;
// At 1,769 MB a function has the equivalent of one vCPU; CPU scales with memory.
export const MB_PER_VCPU = 1769;

const NOTE =
  'More memory also gives the function more CPU (one vCPU at 1,769 MB) and costs more per millisecond, so a ' +
  'CPU-bound function can get faster, and sometimes cheaper, with more. AWS suggests Lambda Power Tuning or ' +
  'Compute Optimizer to find that balance; this result only covers memory use.';

export function mibToMb(mib) {
  return (mib * BYTES_PER_MIB) / BYTES_PER_MB;
}

export function cliCommand(memorySize) {
  return `aws lambda update-function-configuration --function-name <function> --memory-size ${memorySize}`;
}

const fixed = (value) => Number(value.toFixed(1));

function explainSteps(raw, limitMb, rounded, memorySize, vcpu) {
  const memory = `${fixed(raw.peakMiB)} MiB peak + ${percent(raw.limitMarginPct)} = ${fixed(raw.limitMiB)} MiB = ${fixed(limitMb)} MB`;
  return [
    {
      label: 'Memory',
      text:
        memorySize === rounded
          ? `${memory} → ${memorySize} MB`
          : `${memory} → ${rounded} MB, kept within Lambda’s ${MIN_MEMORY_MB}–${MAX_MEMORY_MB} MB → ${memorySize} MB`
    },
    { label: 'CPU', text: `${memorySize} MB ÷ ${MB_PER_VCPU} MB per vCPU ≈ ${vcpu} vCPU` }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const limitMb = mibToMb(raw.limitMiB);
  const rounded = roundUpToMultiple(limitMb, ROUNDING_STEP_MB);
  const memorySize = Math.min(MAX_MEMORY_MB, Math.max(MIN_MEMORY_MB, rounded));
  const clamped = memorySize !== rounded;
  const vcpu = Number((memorySize / MB_PER_VCPU).toFixed(2));

  const warnings = [...raw.warnings];
  if (clamped) {
    warnings.push({
      level: 'warning',
      code: 'lambda-range-clamped',
      message: `Calculated memory (${rounded} MB) is outside Lambda’s ${MIN_MEMORY_MB}–${MAX_MEMORY_MB} MB range; clamped to ${memorySize} MB.`
    });
  }

  const steps = explainSteps(raw, limitMb, rounded, memorySize, vcpu);
  return {
    platform: 'lambda',
    memorySize,
    unclampedMemorySize: rounded,
    vcpu,
    figures: [
      { role: 'total', label: 'Recommended memory', text: `${memorySize} MB`, detail: 'per concurrent execution' },
      { role: 'info', label: 'CPU', text: `≈ ${vcpu} vCPU`, detail: 'scales with memory: 1 vCPU at 1,769 MB' }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      // The gauge is in MiB, so the marker sits at the MemorySize's size in MiB.
      { role: 'limit', name: 'memory', value: (memorySize * BYTES_PER_MB) / BYTES_PER_MIB, text: `${memorySize} MB` }
    ],
    snippet: { label: 'Lambda function configuration', language: 'text', code: `{ "MemorySize": ${memorySize} }\n\n${cliCommand(memorySize)}` },
    alternative: null,
    warnings,
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
