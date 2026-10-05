/**
 * Raw MiB sizing → an Azure Functions instance size.
 *
 * Azure Functions doesn't take a free-form memory value: the instance size is
 * fixed by the hosting plan. Flex Consumption (the recommended serverless plan)
 * offers 512, 2048 and 4096 MB; anything larger needs an Elastic Premium SKU
 * (EP1–EP3). Running out of memory recycles the instance, so, like Lambda and
 * Cloud Run, the size is peak-based and rounds up to the next available step.
 * The legacy Consumption plan has a fixed 1.5 GB and nothing to size.
 *
 * Microsoft suggests 2,048 MB for most apps; this picks the smallest size
 * that fits and says so in the note.
 *
 * The method, sources and assumptions are on /azure-functions/how-it-works/.
 */
import { percent, PEAK_ONLY_FIELD_TIPS } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  ...PEAK_ONLY_FIELD_TIPS,
  peak: 'The instance size is the smallest one that fits this plus the limit margin.'
};

// Flex Consumption instance sizes (MB, read as MiB) and their typical CPU cores.
export const FLEX_SIZES = [
  { memoryMB: 512, cores: 0.25 },
  { memoryMB: 2048, cores: 1 },
  { memoryMB: 4096, cores: 2 }
];
export const FLEX_SIZES_MB = FLEX_SIZES.map((size) => size.memoryMB);

// Elastic Premium instances; the plan documents memory in GB (3.5, 7, 14), read as GiB.
export const PREMIUM_SKUS = [
  { sku: 'EP1', memoryMiB: 3584, cores: 1 },
  { sku: 'EP2', memoryMiB: 7168, cores: 2 },
  { sku: 'EP3', memoryMiB: 14336, cores: 4 }
];

const FLEX_NOTE =
  'Microsoft suggests 2,048 MB for most apps; this picks the smallest size that fits, and smaller sizes get less ' +
  'CPU and lower default HTTP concurrency (4, 16 and 32 requests on 512, 2048 and 4096 MB; 1 for Python). Memory ' +
  'per instance is shared by every execution on it, so this fits the concurrency your samples ran at; the legacy ' +
  'Consumption plan (fixed at 1.5 GB) isn’t sized here.';

const PREMIUM_NOTE =
  'Elastic Premium instances are billed whether or not functions are running, and every function app in the plan ' +
  'shares each instance’s memory. Flex Consumption tops out at 4096 MB; for more memory on demand than Premium ' +
  'offers, consider a Dedicated plan or Functions on Container Apps.';

export function flexCommand(memoryMB) {
  return `az functionapp scale config set --resource-group <resource-group> --name <app> --instance-memory ${memoryMB}`;
}

export function premiumCommand(sku) {
  return `az functionapp plan update --resource-group <resource-group> --name <plan> --sku ${sku}`;
}

const fixed = (value) => Number(value.toFixed(1));

export function coresText(cores) {
  return `${cores} ${cores === 1 ? 'core' : 'cores'}`;
}

function peakStep(raw) {
  return { label: 'Memory', text: `${fixed(raw.peakMiB)} MiB peak + ${percent(raw.limitMarginPct)} = ${fixed(raw.limitMiB)} MiB` };
}

function formatFlex(raw, size) {
  const steps = [
    peakStep(raw),
    { label: 'Instance size', text: `the smallest Flex Consumption size that fits → ${size.memoryMB} MB, ${coresText(size.cores)}` }
  ];
  return {
    plan: 'flex',
    memory: size.memoryMB,
    cores: size.cores,
    figures: [
      { role: 'total', label: 'Instance memory', text: `${size.memoryMB} MB`, detail: 'Flex Consumption, per instance' },
      { role: 'info', label: 'CPU', text: coresText(size.cores), detail: 'typical for this instance size' }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      { role: 'limit', name: 'instance memory', value: size.memoryMB, text: `${size.memoryMB}MB` }
    ],
    snippet: { label: 'Azure CLI (Flex Consumption)', language: 'shell', code: flexCommand(size.memoryMB) },
    alternative: { label: 'Bicep', code: `functionAppConfig.scaleAndConcurrency.instanceMemoryMB: ${size.memoryMB}` },
    warnings: [],
    explanationSteps: steps,
    note: FLEX_NOTE
  };
}

function formatPremium(raw) {
  const fit = PREMIUM_SKUS.find((tier) => tier.memoryMiB >= raw.limitMiB);
  const tier = fit ?? PREMIUM_SKUS.at(-1);
  const warnings = [
    {
      level: 'warning',
      code: 'azure-functions-flex-too-small',
      message: `${Math.round(raw.limitMiB)}MiB is above Flex Consumption’s largest instance (${FLEX_SIZES_MB.at(-1)}MB), so this needs the Elastic Premium plan.`
    }
  ];
  if (!fit) {
    warnings.push({
      level: 'warning',
      code: 'azure-functions-premium-range-exceeded',
      message: `${Math.round(raw.limitMiB)}MiB is above the largest Elastic Premium instance (${tier.sku}, ${tier.memoryMiB}MiB); no Azure Functions instance size on these plans fits.`
    });
  }
  const steps = [
    peakStep(raw),
    {
      label: 'Instance size',
      text: fit
        ? `above Flex Consumption’s 4096 MB, so the smallest Elastic Premium SKU that fits → ${tier.sku} (${tier.memoryMiB} MiB, ${coresText(tier.cores)})`
        : `above every size, so the largest Elastic Premium SKU → ${tier.sku} (${tier.memoryMiB} MiB, ${coresText(tier.cores)})`
    }
  ];
  return {
    plan: 'premium',
    memory: tier.memoryMiB,
    sku: tier.sku,
    cores: tier.cores,
    figures: [
      { role: 'total', label: 'Premium instance', text: tier.sku, detail: `${tier.memoryMiB} MiB, ${tier.cores} vCPU` }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      { role: 'limit', name: tier.sku, value: tier.memoryMiB, text: `${tier.memoryMiB}Mi` }
    ],
    snippet: { label: 'Azure CLI (Elastic Premium)', language: 'shell', code: premiumCommand(tier.sku) },
    alternative: null,
    warnings,
    explanationSteps: steps,
    note: PREMIUM_NOTE
  };
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const flexSize = FLEX_SIZES.find((size) => size.memoryMB >= raw.limitMiB);
  const result = flexSize ? formatFlex(raw, flexSize) : formatPremium(raw);
  return {
    platform: 'azureFunctions',
    ...result,
    warnings: [...raw.warnings, ...result.warnings],
    explanation: result.explanationSteps.map((step) => `${step.label}: ${step.text}.`).join(' ')
  };
}
