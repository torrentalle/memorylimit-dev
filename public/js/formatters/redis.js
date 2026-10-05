/**
 * Raw MiB sizing → Redis `maxmemory`, plus the memory to provision for the
 * Redis process around it.
 *
 * maxmemory caps the dataset: past it Redis evicts keys (allkeys-lru, which
 * Redis suggests as the default for a cache). It's peak-based — the observed
 * `used_memory` peak plus margin, never below the average-based figure —
 * rounded up to a whole mb. The process needs more than maxmemory: Redis
 * documents up to 2× while it writes an RDB snapshot or rewrites the AOF
 * under heavy writes, so the memory to provision is 2× maxmemory. Redis's
 * "mb" unit is 1024×1024 bytes, i.e. MiB.
 *
 * The method, sources and assumptions are on /redis/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { percent } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'maxmemory never goes below this plus the request margin.',
  peak: 'maxmemory is this plus the limit margin, and the memory to provision twice that.'
};

// Redis's mb is MiB; the output uses whole mb.
export const ROUNDING_STEP_MB = 1;
export const PERSISTENCE_OVERHEAD = 2;
export const EVICTION_POLICY = 'allkeys-lru';

const NOTE =
  'Redis can use up to twice its memory while it writes an RDB snapshot or rewrites the AOF, and replicas trigger ' +
  'those saves even with persistence off unless replication is diskless; without either, about 1.25× maxmemory ' +
  'leaves room for fragmentation and buffers. allkeys-lru suits a cache — if this Redis holds data you can’t lose, ' +
  'use noeviction so writes fail at the limit instead of evicting keys.';

export function generateConfig(maxmemory) {
  return [`maxmemory ${maxmemory}mb`, `maxmemory-policy ${EVICTION_POLICY}`].join('\n');
}

export function runtimeCommand(maxmemory) {
  return (
    `redis-cli CONFIG SET maxmemory ${maxmemory}mb && ` +
    `redis-cli CONFIG SET maxmemory-policy ${EVICTION_POLICY} && redis-cli CONFIG REWRITE`
  );
}

const mib = (value) => `${Number(value.toFixed(1))} MiB`;

function explainSteps(raw, maxmemory, provision, fromAverage) {
  return [
    {
      label: 'maxmemory',
      text: fromAverage
        ? `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)}, above the peak-based ${mib(raw.limitMiB)} → ${maxmemory}mb`
        : `${mib(raw.peakMiB)} peak used_memory + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)} → ${maxmemory}mb`
    },
    { label: 'Memory to provision', text: `${PERSISTENCE_OVERHEAD} × ${maxmemory} MB for persistence forks = ${provision} MB` }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const fromAverage = raw.requestMiB > raw.limitMiB;
  const maxmemory = roundUpToMultiple(Math.max(raw.limitMiB, raw.requestMiB), ROUNDING_STEP_MB);
  const provision = maxmemory * PERSISTENCE_OVERHEAD;

  const steps = explainSteps(raw, maxmemory, provision, fromAverage);
  return {
    platform: 'redis',
    maxmemory,
    provision,
    figures: [
      { role: 'request', label: 'maxmemory', text: `${maxmemory}mb`, detail: `evicts keys (${EVICTION_POLICY}) above this` },
      { role: 'total', label: 'Memory to provision', text: `${provision} MB`, detail: 'host or container, with RDB/AOF persistence' }
    ],
    markers: [
      { role: 'request', name: 'maxmemory', value: maxmemory, text: `${maxmemory}mb` },
      { role: 'limit', name: 'provision', value: provision, text: `${provision} MB` }
    ],
    snippet: { label: 'redis.conf', language: 'text', code: generateConfig(maxmemory) },
    alternative: { label: 'Apply without a restart', code: runtimeCommand(maxmemory) },
    warnings: [...raw.warnings],
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
