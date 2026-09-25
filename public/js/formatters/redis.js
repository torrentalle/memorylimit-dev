/**
 * Raw MiB sizing → Redis `maxmemory`, plus the memory to provision for the
 * Redis process around it.
 *
 * maxmemory caps the dataset: past it Redis evicts keys (allkeys-lru, the
 * usual cache policy). It's peak-based — the observed `used_memory` peak
 * plus margin, never below the average-based figure — rounded up to 64 MB.
 * The process needs more than maxmemory: fragmentation, client/replication
 * buffers, and copy-on-write pages while a forked child writes an RDB
 * snapshot or rewrites the AOF, which Redis's docs put at up to 2× under
 * heavy writes. Redis's "mb" unit is 1024×1024 bytes, i.e. MiB.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent } from './shared.js';

export const STEP_MB = 64;
export const PERSISTENCE_OVERHEAD = 2;
export const EVICTION_POLICY = 'allkeys-lru';

const NOTE =
  'The host or container needs room beyond maxmemory for fragmentation, client buffers and the fork Redis makes ' +
  'for RDB snapshots and AOF rewrites; with persistence off (save "" and appendonly no), about 1.25× maxmemory is ' +
  'usually enough. allkeys-lru suits a cache — if this Redis holds data you can’t lose, use noeviction so writes ' +
  'fail at the limit instead of evicting keys.';

export function generateConfig(maxmemory) {
  return [`maxmemory ${maxmemory}mb`, `maxmemory-policy ${EVICTION_POLICY}`].join('\n');
}

export function runtimeCommand(maxmemory) {
  return (
    `redis-cli CONFIG SET maxmemory ${maxmemory}mb && ` +
    `redis-cli CONFIG SET maxmemory-policy ${EVICTION_POLICY} && redis-cli CONFIG REWRITE`
  );
}

function explain(raw, maxmemory, provision) {
  return (
    `maxmemory = ${Math.round(raw.peakMiB)}MiB peak used_memory + ${percent(raw.limitMarginPct)} margin ` +
    `(${describeProfile(raw)}) → rounded up to ${maxmemory}mb; ` +
    `memory to provision = ${PERSISTENCE_OVERHEAD}× maxmemory for persistence forks → ${provision} MB.`
  );
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const maxmemory = roundUpToMultiple(Math.max(raw.limitMiB, raw.requestMiB), STEP_MB);
  const provision = maxmemory * PERSISTENCE_OVERHEAD;

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
    explanation: explain(raw, maxmemory, provision),
    note: NOTE
  };
}
