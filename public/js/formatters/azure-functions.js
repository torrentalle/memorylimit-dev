/**
 * Raw MiB sizing → an Azure Functions instance size.
 *
 * Azure Functions doesn't take a free-form memory value: the instance size is
 * fixed by the hosting plan. Flex Consumption (the recommended serverless plan)
 * offers 512, 2048 and 4096 MB; anything larger needs an Elastic Premium SKU
 * (EP1–EP3). Running out of memory recycles the instance, so, like Lambda and
 * Cloud Run, the size is peak-based and rounds up to the next available step.
 * The legacy Consumption plan has a fixed 1.5 GB and nothing to size.
 */
import { describeProfile, percent, PEAK_ONLY_FIELD_TIPS } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  ...PEAK_ONLY_FIELD_TIPS,
  peak: 'The instance size is the smallest one that fits this plus the limit margin.'
};

export const FLEX_SIZES_MB = [512, 2048, 4096];

// Elastic Premium instances; the plan documents memory in GB.
export const PREMIUM_SKUS = [
  { sku: 'EP1', memoryMiB: 3584, cores: 1 },
  { sku: 'EP2', memoryMiB: 7168, cores: 2 },
  { sku: 'EP3', memoryMiB: 14336, cores: 4 }
];

const FLEX_NOTE =
  'Memory per instance is shared by every execution running on it, so this fits the concurrency your samples were ' +
  'collected under. HTTP triggers default to 4, 16 and 32 concurrent requests on 512, 2048 and 4096 MB instances ' +
  '(1 for Python), and raising concurrency needs more memory or lower per-instance limits. The legacy Consumption plan ' +
  'is fixed at 1.5 GB and isn’t sized here.';

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

function explainBase(raw) {
  return `Memory = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin (${describeProfile(raw)}) = ${Math.round(raw.limitMiB)}MiB`;
}

function formatFlex(raw, memoryMB) {
  return {
    plan: 'flex',
    memory: memoryMB,
    figures: [
      { role: 'total', label: 'Instance memory', text: `${memoryMB} MB`, detail: 'Flex Consumption, per instance' }
    ],
    markers: [
      { role: 'peak', name: 'peak', value: raw.peakMiB, text: `${Math.round(raw.peakMiB)}Mi` },
      { role: 'limit', name: 'instance memory', value: memoryMB, text: `${memoryMB}MB` }
    ],
    snippet: { label: 'Azure CLI (Flex Consumption)', language: 'shell', code: flexCommand(memoryMB) },
    alternative: { label: 'Bicep', code: `functionAppConfig.scaleAndConcurrency.instanceMemoryMB: ${memoryMB}` },
    warnings: [],
    explanation: `${explainBase(raw)} → next Flex Consumption instance size: ${memoryMB}MB.`,
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
  return {
    plan: 'premium',
    memory: tier.memoryMiB,
    sku: tier.sku,
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
    explanation: `${explainBase(raw)} → above Flex Consumption’s 4096MB, so the smallest Elastic Premium SKU that fits: ${tier.sku} (${tier.memoryMiB}MiB).`,
    note: PREMIUM_NOTE
  };
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const flexSize = FLEX_SIZES_MB.find((size) => size >= raw.limitMiB);
  const result = flexSize ? formatFlex(raw, flexSize) : formatPremium(raw);
  return { platform: 'azureFunctions', ...result, warnings: [...raw.warnings, ...result.warnings] };
}
