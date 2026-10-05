/**
 * Platform-agnostic sizing math: observed average/peak usage in,
 * unrounded MiB request/limit out. Platform-specific rounding and output
 * live in ./formatters/.
 *
 * The margin tables below are MemoryLimit's own defaults (see
 * /sizing-model/). A page can replace the margin they give with
 * `requestMargin` / `limitMargin`, which every calculator offers under
 * "Advanced: margins and defaults".
 */

export const WORKLOAD_TYPES = ['api', 'worker', 'cache', 'jvm', 'node', 'python', 'generic'];
export const SENSITIVITIES = ['low', 'medium', 'high'];
export const ENVIRONMENTS = ['development', 'staging', 'production'];

export const SENSITIVITY_REQUEST_MARGIN = { low: 0.15, medium: 0.30, high: 0.50 };
export const SENSITIVITY_LIMIT_MARGIN = { low: 0.20, medium: 0.30, high: 0.40 };

// Percentage points added to the sensitivity margin, before the
// environment multiplier is applied.
export const WORKLOAD_REQUEST_ADJUSTMENT = { api: 0, worker: -0.10, cache: 0.05, jvm: 0.15, node: 0, python: 0, generic: 0 };
export const WORKLOAD_LIMIT_ADJUSTMENT = { api: 0, worker: 0.35, cache: 0, jvm: 0.30, node: 0, python: 0, generic: 0 };

export const ENVIRONMENT_MULTIPLIER = { development: 0.6, staging: 0.85, production: 1.0 };

// The range the pages accept for a margin override, as a fraction: 0% to 200%.
export const MARGIN_OVERRIDE_RANGE = { min: 0, max: 2 };

// Margins like 0.15 aren't exact in binary floating point, so 200 × 1.12
// comes out as 224.00000000000003 — which would otherwise round up a
// whole extra step (256Mi instead of 224Mi).
const FLOAT_TOLERANCE = 1e-9;

export function roundUpToMultiple(value, multiple) {
  return Math.ceil(value / multiple - FLOAT_TOLERANCE) * multiple;
}

function marginFor(baseTable, adjustmentTable, { sensitivity, workloadType, environment }) {
  return Math.max(0, baseTable[sensitivity] + adjustmentTable[workloadType]) * ENVIRONMENT_MULTIPLIER[environment];
}

function assertPositiveNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number (got ${value})`);
  }
}

function assertMarginOverride(name, value) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number (got ${value})`);
  }
}

function assertOneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new RangeError(`${name} must be one of ${allowed.join(', ')} (got ${value})`);
  }
}

/**
 * @param {object} input
 * @param {number} input.averageMiB - average observed usage, in MiB
 * @param {number} input.peakMiB - peak observed usage, in MiB
 * @param {string} [input.workloadType='generic'] - one of WORKLOAD_TYPES
 * @param {string} [input.sensitivity='medium'] - one of SENSITIVITIES
 * @param {string} [input.environment='production'] - one of ENVIRONMENTS
 * @param {number} [input.replicas=1] - positive integer
 * @param {number} [input.requestMargin] - replaces the request margin the profile gives (a fraction: 0.3 = 30%)
 * @param {number} [input.limitMargin] - replaces the limit margin the profile gives
 * @throws {RangeError} on invalid input, rather than silently coercing it
 */
export function calculateRawSizing({
  averageMiB,
  peakMiB,
  workloadType = 'generic',
  sensitivity = 'medium',
  environment = 'production',
  replicas = 1,
  requestMargin,
  limitMargin
}) {
  assertPositiveNumber('averageMiB', averageMiB);
  assertPositiveNumber('peakMiB', peakMiB);
  assertOneOf('workloadType', workloadType, WORKLOAD_TYPES);
  assertOneOf('sensitivity', sensitivity, SENSITIVITIES);
  assertOneOf('environment', environment, ENVIRONMENTS);
  if (!Number.isInteger(replicas) || replicas < 1) {
    throw new RangeError(`replicas must be a positive integer (got ${replicas})`);
  }
  assertMarginOverride('requestMargin', requestMargin);
  assertMarginOverride('limitMargin', limitMargin);

  const profile = { sensitivity, workloadType, environment };
  // What the profile gives is kept even when overridden, so a page can show what an override replaces.
  const profileRequestMarginPct = marginFor(SENSITIVITY_REQUEST_MARGIN, WORKLOAD_REQUEST_ADJUSTMENT, profile);
  const profileLimitMarginPct = marginFor(SENSITIVITY_LIMIT_MARGIN, WORKLOAD_LIMIT_ADJUSTMENT, profile);
  const requestMarginPct = requestMargin ?? profileRequestMarginPct;
  const limitMarginPct = limitMargin ?? profileLimitMarginPct;

  const warnings = [];
  if (peakMiB < averageMiB) {
    warnings.push({
      level: 'error',
      code: 'peak-below-average',
      message: 'Peak usage is lower than average usage — double-check the input data.'
    });
  }

  return {
    averageMiB,
    peakMiB,
    ...profile,
    replicas,
    requestMarginPct,
    limitMarginPct,
    profileRequestMarginPct,
    profileLimitMarginPct,
    requestMiB: averageMiB * (1 + requestMarginPct),
    limitMiB: peakMiB * (1 + limitMarginPct),
    warnings
  };
}
