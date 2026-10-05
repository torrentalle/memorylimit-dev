/**
 * Raw MiB sizing → a Google Cloud Run memory limit.
 *
 * Like Lambda, Cloud Run has one memory setting per instance and running
 * out terminates the instance, so the size is peak-based. It rounds up to a
 * whole Mi, is kept within Cloud Run's 128 Mi – 32 Gi range, and sizes above
 * 4 GiB carry the minimum CPU Cloud Run requires for them. Up to 4 GiB the
 * default 1 vCPU is enough.
 *
 * Google's own sizing formula is standing memory + memory per request ×
 * concurrency. The measured peak already contains it for the concurrency the
 * samples ran at; given the instance's idle (standing) memory and a planned
 * concurrency, the calculator applies the formula: memory per request =
 * (peak − idle) ÷ current concurrency, and the planned peak = idle + memory
 * per request × planned concurrency, before the margin.
 *
 * The method, sources and assumptions are on /cloud-run/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent, PEAK_ONLY_FIELD_TIPS } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  ...PEAK_ONLY_FIELD_TIPS,
  peak: 'The memory limit is this plus the limit margin; above 4 GiB it also sets the minimum CPU.',
  standingMiB: 'The memory an instance uses with no requests; the rest of the peak is split per request to scale it to the planned concurrency.',
  currentConcurrency: 'The maximum concurrent requests per instance when the samples were taken; the peak is divided by it to get memory per request.',
  targetConcurrency: 'The maximum concurrent requests per instance you plan; memory per request is multiplied by it, so a higher value needs more memory.'
};

// Cloud Run takes any Mi value; the output uses whole Mi.
export const ROUNDING_STEP_MIB = 1;
export const MIN_MEMORY_MIB = 128;
export const MIN_GEN2_MEMORY_MIB = 512;
export const MAX_MEMORY_MIB = 32768;
export const DEFAULT_CPU = 1;
// Cloud Run's default maximum concurrency (console; the CLI sets 80 × vCPUs), and its maximum.
export const DEFAULT_CONCURRENCY = 80;
export const MAX_CONCURRENCY = 1000;

// The fewest vCPUs Cloud Run allows for a memory size (in MiB), from 1 vCPU up. Below 1 vCPU, Cloud Run also
// allows 0.5 vCPU up to 1 GiB and 0.08 vCPU up to 512 MiB, with extra restrictions; the default is 1 vCPU.
const CPU_FOR_MEMORY = [
  { upToMiB: 4096, cpu: 1 },
  { upToMiB: 8192, cpu: 2 },
  { upToMiB: 16384, cpu: 4 },
  { upToMiB: 24576, cpu: 6 },
  { upToMiB: 32768, cpu: 8 }
];

const NOTE =
  'Google sizes memory as standing memory + memory per request × concurrency: fill in the idle memory and the ' +
  'planned concurrency to apply it, otherwise this fits the concurrency your samples ran at. Files written to the ' +
  'container’s filesystem are held in memory and count against this limit too.';

export function minimumCpu(memoryMiB) {
  return CPU_FOR_MEMORY.find((tier) => memoryMiB <= tier.upToMiB).cpu;
}

export function formatQuantity(memoryMiB) {
  return memoryMiB % 1024 === 0 ? `${memoryMiB / 1024}Gi` : `${memoryMiB}Mi`;
}

export function gcloudCommand(memoryMiB) {
  const cpu = minimumCpu(memoryMiB);
  return `gcloud run services update <service> --memory ${formatQuantity(memoryMiB)}${cpu > DEFAULT_CPU ? ` --cpu ${cpu}` : ''}`;
}

export function yamlSnippet(memoryMiB) {
  const cpu = minimumCpu(memoryMiB);
  return [
    'spec.template.spec.containers[0].resources.limits:',
    `  memory: ${formatQuantity(memoryMiB)}`,
    ...(cpu > DEFAULT_CPU ? [`  cpu: ${cpu}`] : [])
  ].join('\n');
}

const fixed = (value) => Number(value.toFixed(1));

/**
 * Google's formula applied to the samples: returns the peak to size from (MiB) and, when concurrency changes,
 * the per-request figures behind it.
 */
export function plannedPeak(peakMiB, { standingMiB = 0, currentConcurrency = DEFAULT_CONCURRENCY, targetConcurrency } = {}) {
  const current = Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(currentConcurrency)));
  const target = targetConcurrency === undefined ? current : Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(targetConcurrency)));
  const standing = Math.min(standingMiB, peakMiB);
  if (target === current) return { peakMiB, scaled: false, current, target, standing };
  const perRequestMiB = (peakMiB - standing) / current;
  return { peakMiB: standing + perRequestMiB * target, scaled: true, current, target, standing, perRequestMiB };
}

function explainSteps(raw, plan, sizedMiB, rounded, memory, cpu) {
  const base = plan.scaled
    ? `${fixed(plan.peakMiB)} MiB planned peak + ${percent(raw.limitMarginPct)} = ${fixed(sizedMiB)} MiB`
    : `${fixed(raw.peakMiB)} MiB peak + ${percent(raw.limitMarginPct)} = ${fixed(raw.limitMiB)} MiB`;
  const concurrency = plan.scaled
    ? [{
        label: 'Concurrency',
        text: `${fixed(plan.standing)} MiB idle + (${fixed(raw.peakMiB)} − ${fixed(plan.standing)}) ÷ ${plan.current} × ${plan.target} requests = ${fixed(plan.peakMiB)} MiB planned peak`
      }]
    : [];
  return [
    ...concurrency,
    {
      label: 'Memory',
      text: memory === rounded
        ? `${base} → ${formatQuantity(memory)}`
        : `${base} → ${rounded}Mi, kept within Cloud Run’s 128Mi–32Gi → ${formatQuantity(memory)}`
    },
    {
      label: 'CPU',
      text: cpu > DEFAULT_CPU
        ? `${formatQuantity(memory)} needs at least ${cpu} vCPU`
        : `the default 1 vCPU covers up to 4Gi`
    }
  ];
}

/**
 * @param {object} raw - result of calculateRawSizing()
 * @param {{ standingMiB?: number, currentConcurrency?: number, targetConcurrency?: number }} [options]
 */
export function format(raw, options = {}) {
  const plan = plannedPeak(raw.peakMiB, options);
  const sizedMiB = plan.peakMiB * (1 + raw.limitMarginPct);
  const rounded = roundUpToMultiple(sizedMiB, ROUNDING_STEP_MIB);
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

  if (plan.scaled && !(options.standingMiB > 0)) {
    warnings.push({
      level: 'warning',
      code: 'cloud-run-no-idle-memory',
      message:
        'Without the idle memory per instance, the whole peak is treated as per-request memory, so the result scales ' +
        `fully with concurrency: ${plan.target > plan.current ? 'an upper' : 'a lower'} bound.`
    });
  }

  const steps = explainSteps(raw, plan, sizedMiB, rounded, memory, cpu);
  return {
    platform: 'cloudRun',
    memory,
    cpu,
    plannedPeakMiB: plan.peakMiB,
    figures: [
      { role: 'total', label: 'Memory limit', text: formatQuantity(memory), detail: 'per instance' },
      {
        role: 'info',
        label: 'CPU',
        text: `${cpu} vCPU`,
        detail: cpu > DEFAULT_CPU ? 'the least Cloud Run allows for this memory' : 'the default, enough up to 4 GiB'
      }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      { role: 'limit', name: 'memory', value: memory, text: formatQuantity(memory) }
    ],
    snippet: { label: 'gcloud command', language: 'shell', code: gcloudCommand(memory) },
    alternative: { label: 'service.yaml', code: yamlSnippet(memory) },
    warnings,
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
