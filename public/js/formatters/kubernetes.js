/**
 * Raw MiB sizing → Kubernetes resources.requests/limits.memory.
 *
 * Burstable (default): request = the average-based value, limit = the
 * peak-based value, both rounded up to a whole Mi. Kubernetes rejects a
 * request above its limit, so when steady workloads would invert them the
 * limit is raised to the request.
 *
 * Guaranteed: request = limit, sized to cover both the peak-based limit
 * and the average-based request. Memory is incompressible, so this is the
 * safest choice for workloads that must never be evicted under pressure.
 * The Pod is only Guaranteed if its CPU request equals its CPU limit too.
 *
 * The method, sources and assumptions are on /kubernetes/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent, pluralize } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  peak: 'The limit is this plus the limit margin, and never below the request.'
};

// Kubernetes takes any quantity; the manifest uses whole Mi.
export const ROUNDING_STEP_MIB = 1;
export const OVERCOMMIT_RATIO = 4;
export const QOS_CLASSES = ['burstable', 'guaranteed'];

const BURSTABLE_NOTE =
  'A Pod using more than its request is among the first evicted when its node runs short of memory. ' +
  'Kubernetes’ Vertical Pod Autoscaler sizes the request from daily peaks instead, so it would recommend more.';
const GUARANTEED_NOTE =
  'The Pod is only Guaranteed if every container also sets its CPU request equal to its CPU limit; ' +
  'otherwise it stays Burstable.';

export function generateYaml(request, limit) {
  return [
    'resources:',
    '  requests:',
    `    memory: "${request}Mi"`,
    '  limits:',
    `    memory: "${limit}Mi"`
  ].join('\n');
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, request, limit, totalRequest, qos, limitFloored) {
  const fromAverage = `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)}`;
  const fromPeak = `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)}`;
  const total = { label: 'Total request', text: `${request}Mi × ${pluralize(raw.replicas, 'replica')} = ${totalRequest}Mi` };

  if (qos === 'guaranteed') {
    return [
      {
        label: 'Limit',
        // The average-based value only shows when it's the larger one, i.e. when it sets the limit.
        text:
          raw.requestMiB > raw.limitMiB
            ? `${fromAverage} = ${mib(raw.requestMiB)}, above the peak-based ${mib(raw.limitMiB)} → ${limit}Mi`
            : `${fromPeak} = ${mib(raw.limitMiB)} → ${limit}Mi`
      },
      { label: 'Request', text: `equal to the limit for Guaranteed QoS → ${request}Mi` },
      total
    ];
  }
  return [
    { label: 'Request', text: `${fromAverage} = ${mib(raw.requestMiB)} → ${request}Mi` },
    {
      label: 'Limit',
      text: limitFloored
        ? `${fromPeak} = ${mib(raw.limitMiB)}, raised to the request → ${limit}Mi`
        : `${fromPeak} = ${mib(raw.limitMiB)} → ${limit}Mi`
    },
    total
  ];
}

/**
 * @param {object} raw - result of calculateRawSizing()
 * @param {{ qos?: 'burstable' | 'guaranteed' }} [options]
 */
export function format(raw, { qos = 'burstable' } = {}) {
  let request;
  let limit;
  let limitFloored = false;
  if (qos === 'guaranteed') {
    limit = roundUpToMultiple(Math.max(raw.limitMiB, raw.requestMiB), ROUNDING_STEP_MIB);
    request = limit;
  } else {
    request = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MIB);
    // The API rejects a request above the limit.
    limitFloored = request > raw.limitMiB;
    limit = roundUpToMultiple(Math.max(raw.limitMiB, request), ROUNDING_STEP_MIB);
  }
  const totalRequest = request * raw.replicas;
  const ratio = limit / request;

  const warnings = [...raw.warnings];
  if (ratio > OVERCOMMIT_RATIO) {
    warnings.push({
      level: 'warning',
      code: 'overcommit-risk',
      message:
        `The limit is ${ratio.toFixed(1)}× the request. The scheduler only reserves the request, so pods can grow ` +
        'far past what their node set aside; if several do at once the node runs out of memory and the kubelet ' +
        'starts evicting pods. Consider a higher request or Guaranteed QoS.'
    });
  }

  const steps = explainSteps(raw, request, limit, totalRequest, qos, limitFloored);
  return {
    platform: 'kubernetes',
    qos,
    request,
    limit,
    totalRequest,
    ratio,
    figures: [
      { role: 'request', label: 'Request', text: `${request}Mi`, detail: 'per replica' },
      { role: 'limit', label: 'Limit', text: `${limit}Mi`, detail: 'per replica' },
      { role: 'total', label: 'Total request', text: `${totalRequest}Mi`, detail: `across ${pluralize(raw.replicas, 'replica')}` }
    ],
    markers: [
      { role: 'request', name: 'request', value: request, text: `${request}Mi` },
      { role: 'limit', name: 'limit', value: limit, text: `${limit}Mi` }
    ],
    snippet: { label: 'Kubernetes manifest', language: 'yaml', code: generateYaml(request, limit) },
    alternative: null,
    warnings,
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: qos === 'guaranteed' ? GUARANTEED_NOTE : BURSTABLE_NOTE
  };
}
