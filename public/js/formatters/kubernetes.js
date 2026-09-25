/**
 * Raw MiB sizing → Kubernetes resources.requests/limits.memory.
 *
 * Burstable (default): request rounds up to the nearest 32Mi; limit rounds
 * up to the nearest 64Mi and is floored at 1.2× the *rounded* request, so
 * the manifest's actual ratio honors the floor.
 *
 * Guaranteed: request = limit, sized to cover both the peak-based limit
 * and the average-based request. Memory is incompressible, so this is the
 * safest choice for workloads that must never be evicted under pressure.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent, pluralize } from './shared.js';

export const REQUEST_STEP_MIB = 32;
export const LIMIT_STEP_MIB = 64;
export const MIN_LIMIT_TO_REQUEST_RATIO = 1.2;
export const OVERCOMMIT_RATIO = 4;
export const QOS_CLASSES = ['burstable', 'guaranteed'];

export function generateYaml(request, limit) {
  return [
    'resources:',
    '  requests:',
    `    memory: "${request}Mi"`,
    '  limits:',
    `    memory: "${limit}Mi"`
  ].join('\n');
}

function explain(raw, request, limit, qos) {
  const avg = `${Math.round(raw.averageMiB)}MiB average + ${percent(raw.requestMarginPct)}`;
  const peak = `${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)}`;
  const profile = describeProfile(raw);

  if (qos === 'guaranteed') {
    return `Guaranteed QoS: request = limit = the larger of ${peak} and ${avg} margin (${profile}) → rounded up to ${limit}Mi.`;
  }
  return (
    `Request = ${avg} margin (${profile}) → rounded up to ${request}Mi; ` +
    `limit = ${peak} margin, never below ${MIN_LIMIT_TO_REQUEST_RATIO}× request → rounded up to ${limit}Mi.`
  );
}

/**
 * @param {object} raw - result of calculateRawSizing()
 * @param {{ qos?: 'burstable' | 'guaranteed' }} [options]
 */
export function format(raw, { qos = 'burstable' } = {}) {
  let request;
  let limit;
  if (qos === 'guaranteed') {
    limit = roundUpToMultiple(Math.max(raw.limitMiB, raw.requestMiB), LIMIT_STEP_MIB);
    request = limit;
  } else {
    request = roundUpToMultiple(raw.requestMiB, REQUEST_STEP_MIB);
    limit = roundUpToMultiple(Math.max(raw.limitMiB, request * MIN_LIMIT_TO_REQUEST_RATIO), LIMIT_STEP_MIB);
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
    explanation: explain(raw, request, limit, qos),
    note: null
  };
}
