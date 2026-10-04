/**
 * Couchbase memory quotas, per service and per bucket.
 *
 * Unlike the other platforms this isn't driven by an observed average/peak:
 * Couchbase sizes the Data service from the dataset (documents × size,
 * replicas, how much of it should stay resident), so the input is a list of
 * buckets plus the node layout. `calculateSizing()` is the pure math and
 * `format()` turns it into the same kind of result the other formatters
 * return (figures, snippet, alternative, warnings, explanation, note).
 *
 * Two levels of quota:
 *  - per service, per node (Data, Index, Search, Eventing, Analytics) — set
 *    with `couchbase-cli setting-cluster` / POST /pools/default and applied
 *    on every node that runs the service;
 *  - per bucket, cluster-wide — carved out of the Data service quota, so the
 *    bucket quotas must add up to at most Data quota × Data nodes.
 * The Query service has no quota; it uses whatever the OS has left.
 *
 * Bucket formula, from Couchbase's sizing guidance:
 *   copies    = 1 + replicas
 *   metadata  = documents × (METADATA_BYTES + key length) × copies
 *   dataset   = documents × document size × copies
 *   resident  = dataset × working set %
 *   quota     = (metadata + resident) × (1 + headroom) / HIGH_WATER_MARK
 * With full eviction metadata isn't pinned in RAM, so only the working-set
 * share of it counts.
 */
import { roundUpToMultiple } from '../calculator.js';
import { pluralize } from './shared.js';

export const STEP_MIB = 64;
export const METADATA_BYTES = 56;
export const HIGH_WATER_MARK = 0.85;
export const MAX_REPLICAS = 3;
export const EVICTION_POLICIES = ['value', 'full'];
export const HEADROOM = { low: 0.2, medium: 0.25, high: 0.3 };

/** Documented minimums, in MiB, for the cluster-wide service quotas and for a bucket. */
export const MIN_QUOTA_MIB = { data: 256, index: 256, search: 256, eventing: 256, analytics: 1024 };
export const MIN_BUCKET_MIB = 100;

/** Share of node RAM the service quotas may use before the OS and the Query service are squeezed. */
export const RECOMMENDED_QUOTA_SHARE = 0.7;
export const MAX_QUOTA_SHARE = 0.8;

const MIB = 1024 * 1024;
const SERVICE_LABELS = { data: 'Data', index: 'Index', search: 'Search', eventing: 'Eventing', analytics: 'Analytics' };
const SETTING_FLAGS = {
  data: '--cluster-ramsize',
  index: '--cluster-index-ramsize',
  search: '--cluster-fts-ramsize',
  eventing: '--cluster-eventing-ramsize',
  analytics: '--cluster-analytics-ramsize'
};
const REST_FIELDS = {
  data: 'memoryQuota',
  index: 'indexMemoryQuota',
  search: 'ftsMemoryQuota',
  eventing: 'eventingMemoryQuota',
  analytics: 'cbasMemoryQuota'
};

const NOTE =
  'Quotas are per node and apply on every node running the service; bucket quotas are cluster-wide and come out of ' +
  'the Data quota. The Query service has no quota and uses OS memory, so leave it room — and the OS, which Couchbase ' +
  'also relies on for the file cache. Index, Search, Eventing and Analytics quotas are the values you entered; size ' +
  'them from the real index and service sizes. Minimums and defaults vary between Couchbase Server versions, so check ' +
  'yours before applying.';

function assertNonNegativeNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number (got ${value})`);
  }
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer (got ${value})`);
}

function sizeBucket(bucket, headroom) {
  const { name, documents, keyBytes, documentBytes, replicas, workingSetPct, eviction } = bucket;
  if (typeof name !== 'string' || !name.trim()) throw new RangeError('bucket name must not be empty');
  assertNonNegativeNumber(`${name}: documents`, documents);
  assertNonNegativeNumber(`${name}: keyBytes`, keyBytes);
  assertNonNegativeNumber(`${name}: documentBytes`, documentBytes);
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > MAX_REPLICAS) {
    throw new RangeError(`${name}: replicas must be an integer from 0 to ${MAX_REPLICAS} (got ${replicas})`);
  }
  if (typeof workingSetPct !== 'number' || !(workingSetPct > 0 && workingSetPct <= 100)) {
    throw new RangeError(`${name}: workingSetPct must be above 0 and at most 100 (got ${workingSetPct})`);
  }
  if (!EVICTION_POLICIES.includes(eviction)) {
    throw new RangeError(`${name}: eviction must be one of ${EVICTION_POLICIES.join(', ')} (got ${eviction})`);
  }

  const copies = 1 + replicas;
  const workingSet = workingSetPct / 100;
  const metadataMiB = (documents * (METADATA_BYTES + keyBytes) * copies) / MIB;
  const datasetMiB = (documents * documentBytes * copies) / MIB;
  const residentMetadataMiB = eviction === 'value' ? metadataMiB : metadataMiB * workingSet;
  const residentDataMiB = datasetMiB * workingSet;
  const rawQuotaMiB = ((residentMetadataMiB + residentDataMiB) * (1 + headroom)) / HIGH_WATER_MARK;

  return {
    name: name.trim(),
    replicas,
    eviction,
    metadataMiB,
    datasetMiB,
    residentMetadataMiB,
    residentDataMiB,
    rawQuotaMiB,
    quotaMiB: Math.max(MIN_BUCKET_MIB, roundUpToMultiple(rawQuotaMiB, STEP_MIB))
  };
}

/**
 * @param {object} input
 * @param {Array<object>} input.buckets - name, documents, keyBytes, documentBytes, replicas, workingSetPct, eviction
 * @param {number} input.dataNodes - nodes running the Data service
 * @param {number} input.nodeRamMiB - RAM of one node
 * @param {object} [input.services] - per-node quota in MiB for index/search/eventing/analytics; 0 or absent = not running
 * @param {string} [input.headroom='medium'] - one of HEADROOM's keys
 * @throws {RangeError} on invalid input, rather than silently coercing it
 */
export function calculateSizing({ buckets, dataNodes, nodeRamMiB, services = {}, headroom = 'medium' }) {
  if (!Array.isArray(buckets) || buckets.length === 0) throw new RangeError('at least one bucket is required');
  assertPositiveInteger('dataNodes', dataNodes);
  if (typeof nodeRamMiB !== 'number' || !Number.isFinite(nodeRamMiB) || nodeRamMiB <= 0) {
    throw new RangeError(`nodeRamMiB must be a positive number (got ${nodeRamMiB})`);
  }
  if (!(headroom in HEADROOM)) throw new RangeError(`headroom must be one of ${Object.keys(HEADROOM).join(', ')} (got ${headroom})`);
  const names = buckets.map((bucket) => String(bucket.name).trim());
  if (new Set(names).size !== names.length) throw new RangeError('bucket names must be unique');

  const sized = buckets.map((bucket) => sizeBucket(bucket, HEADROOM[headroom]));
  const bucketsTotalMiB = sized.reduce((sum, bucket) => sum + bucket.quotaMiB, 0);

  const quotas = { data: Math.max(MIN_QUOTA_MIB.data, roundUpToMultiple(bucketsTotalMiB / dataNodes, STEP_MIB)) };
  const warnings = [];
  for (const service of ['index', 'search', 'eventing', 'analytics']) {
    const value = services[service] ?? 0;
    assertNonNegativeNumber(`${service} quota`, value);
    if (value === 0) continue;
    quotas[service] = Math.round(value);
    if (quotas[service] < MIN_QUOTA_MIB[service]) {
      warnings.push({
        level: 'error',
        code: `${service}-below-minimum`,
        message: `The ${SERVICE_LABELS[service]} quota is below Couchbase's ${MIN_QUOTA_MIB[service]} MiB minimum.`
      });
    }
  }

  const quotaTotalMiB = Object.values(quotas).reduce((sum, value) => sum + value, 0);
  const quotaShare = quotaTotalMiB / nodeRamMiB;
  if (quotaShare > MAX_QUOTA_SHARE) {
    warnings.push({
      level: 'error',
      code: 'quotas-exceed-ram',
      message:
        `Service quotas total ${quotaTotalMiB} MiB, ${Math.round(quotaShare * 100)}% of the node's RAM — ` +
        'Couchbase would crowd out the OS and the Query service. Add nodes or RAM, or lower the working set.'
    });
  } else if (quotaShare > RECOMMENDED_QUOTA_SHARE) {
    warnings.push({
      level: 'warning',
      code: 'quotas-high-share',
      message:
        `Service quotas use ${Math.round(quotaShare * 100)}% of the node's RAM; ` +
        `keep them under ${Math.round(RECOMMENDED_QUOTA_SHARE * 100)}% to leave room for the OS and the Query service.`
    });
  }

  for (const bucket of sized) {
    if (bucket.rawQuotaMiB < MIN_BUCKET_MIB) {
      warnings.push({
        level: 'warning',
        code: 'bucket-at-minimum',
        message: `Bucket "${bucket.name}" needs less than Couchbase's ${MIN_BUCKET_MIB} MiB minimum, so it was raised to that.`
      });
    }
  }

  return {
    buckets: sized,
    dataNodes,
    nodeRamMiB,
    headroom,
    bucketsTotalMiB,
    quotas,
    quotaTotalMiB,
    quotaShare,
    warnings
  };
}

export function clusterCommand(quotas) {
  const flags = Object.entries(quotas).map(([service, value]) => `${SETTING_FLAGS[service]} ${value}`);
  return ['couchbase-cli setting-cluster -c localhost:8091 -u Administrator -p "$CB_PASSWORD"', ...flags].join(' \\\n  ');
}

export function bucketCommand(bucket) {
  return (
    'couchbase-cli bucket-edit -c localhost:8091 -u Administrator -p "$CB_PASSWORD" ' +
    `--bucket ${bucket.name} --bucket-ramsize ${bucket.quotaMiB}`
  );
}

export function restCommand(quotas) {
  const fields = Object.entries(quotas).map(([service, value]) => `-d ${REST_FIELDS[service]}=${value}`);
  return ['curl -u Administrator:"$CB_PASSWORD" -X POST http://localhost:8091/pools/default', ...fields].join(' \\\n  ');
}

function explain(sizing) {
  const { buckets, dataNodes, headroom, bucketsTotalMiB, quotas } = sizing;
  return (
    `Each bucket = (resident metadata + working set) × ${1 + HEADROOM[headroom]} headroom ÷ ${HIGH_WATER_MARK} high-water mark, ` +
    `rounded up to ${STEP_MIB} MiB: ${buckets.map((b) => `${b.name} ${b.quotaMiB} MiB`).join(', ')} ` +
    `→ ${bucketsTotalMiB} MiB across ${pluralize(dataNodes, 'Data node')} → Data quota ${quotas.data} MiB per node.`
  );
}

/** @param {object} input - see calculateSizing() */
export function format(input) {
  const sizing = calculateSizing(input);
  const { buckets, quotas, quotaTotalMiB, quotaShare, nodeRamMiB } = sizing;

  const serviceFigures = Object.entries(quotas).map(([service, value]) => ({
    role: 'request',
    label: `${SERVICE_LABELS[service]} quota`,
    text: `${value} MiB`,
    detail: 'per node running the service'
  }));
  const bucketFigures = buckets.map((bucket) => ({
    role: 'request',
    label: `Bucket ${bucket.name}`,
    text: `${bucket.quotaMiB} MiB`,
    detail: `${bucket.replicas} ${bucket.replicas === 1 ? 'replica' : 'replicas'}, cluster-wide`
  }));

  return {
    platform: 'couchbase',
    sizing,
    figures: [
      ...serviceFigures,
      ...bucketFigures,
      {
        role: 'total',
        label: 'Quotas per node',
        text: `${quotaTotalMiB} MiB`,
        detail: `${Math.round(quotaShare * 100)}% of ${Math.round(nodeRamMiB)} MiB node RAM`
      }
    ],
    snippet: {
      label: 'couchbase-cli',
      language: 'text',
      code: [clusterCommand(quotas), ...buckets.map(bucketCommand)].join('\n')
    },
    alternative: { label: 'Cluster quotas through the REST API', code: restCommand(quotas) },
    warnings: [...sizing.warnings],
    explanation: explain(sizing),
    note: NOTE
  };
}
