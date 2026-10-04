/**
 * Raw MiB sizing → a single AWS Lambda MemorySize.
 *
 * Lambda has no separate request/limit: one allocation sets memory,
 * proportional vCPU and per-millisecond cost. Running out causes a hard
 * failure rather than throttling, so the size is peak-based (using the same
 * limit margin as the dual-value platforms), not average-based.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent, PEAK_ONLY_FIELD_TIPS } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  ...PEAK_ONLY_FIELD_TIPS,
  peak: 'MemorySize is this plus the limit margin.'
};

// Lambda accepts any whole number of MB in range. Some older deploy tools
// still enforce 64 MB steps; round further up if you target one of those.
export const ROUNDING_STEP_MB = 1;
export const MIN_MEMORY_MB = 128;
export const MAX_MEMORY_MB = 10240;

const COST_LATENCY_NOTE =
  'More memory also means a higher cost per millisecond and proportionally more CPU, which shortens CPU-bound ' +
  'invocations — so this is a cost/latency trade-off, not just a safety margin.';

function explain(raw, rounded, memorySize, clamped) {
  const base = `Memory = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin (${describeProfile(raw)})`;
  return clamped
    ? `${base} → ${rounded}MB, clamped to Lambda’s ${MIN_MEMORY_MB}–${MAX_MEMORY_MB}MB range → ${memorySize}MB.`
    : `${base} → rounded up to ${memorySize}MB.`;
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const rounded = roundUpToMultiple(raw.limitMiB, ROUNDING_STEP_MB);
  const memorySize = Math.min(MAX_MEMORY_MB, Math.max(MIN_MEMORY_MB, rounded));
  const clamped = memorySize !== rounded;

  const warnings = [...raw.warnings];
  if (clamped) {
    warnings.push({
      level: 'warning',
      code: 'lambda-range-clamped',
      message: `Calculated memory (${rounded}MB) is outside Lambda’s ${MIN_MEMORY_MB}–${MAX_MEMORY_MB}MB range; clamped to ${memorySize}MB.`
    });
  }

  const json = `{ "MemorySize": ${memorySize} }`;
  const cli = `aws lambda update-function-configuration --memory-size ${memorySize}`;

  return {
    platform: 'lambda',
    memorySize,
    unclampedMemorySize: rounded,
    figures: [
      { role: 'total', label: 'Recommended memory', text: `${memorySize} MB`, detail: 'per concurrent execution' }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      { role: 'limit', name: 'memory', value: memorySize, text: `${memorySize}MB` }
    ],
    snippet: { label: 'Lambda function configuration', language: 'text', code: `${json}\n\n${cli}` },
    alternative: null,
    warnings,
    explanation: explain(raw, rounded, memorySize, clamped),
    note: COST_LATENCY_NOTE
  };
}
