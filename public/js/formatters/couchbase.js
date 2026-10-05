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
 *  - per bucket, also per node — carved out of the Data service quota on
 *    every Data node, so the bucket quotas must add up to at most the Data
 *    quota. Couchbase's ramQuota and `bucket-edit --bucket-ramsize` are MiB
 *    per node.
 * The Query service has no quota; it uses whatever the OS has left.
 *
 * Bucket formula, from Couchbase's sizing guidance:
 *   copies    = 1 + replicas
 *   metadata  = documents × (METADATA_BYTES + key length) × copies
 *   dataset   = documents × document size × copies
 *   resident  = dataset × working set %
 *   need      = (metadata + resident) × (1 + OVERHEAD) / HIGH_WATER_MARK   (the whole cluster)
 *   quota     = need / Data nodes, rounded up to a whole MiB              (per node)
 * With full eviction metadata isn't pinned in RAM, so only the working-set
 * share of it counts.
 *
 * The constants in that formula, and the thresholds of the warnings, are
 * defaults (DEFAULT_SETTINGS) a caller can replace with `settings`: the page
 * offers them under "Advanced: sizing defaults and thresholds".
 */
import { roundUpToMultiple } from '../calculator.js';
import { pluralize } from './shared.js';

// Couchbase takes quotas in whole MiB; any value above the minimum is valid, so round up no further.
export const STEP_MIB = 1;
export const METADATA_BYTES = 56;
export const HIGH_WATER_MARK = 0.85;
export const MAX_REPLICAS = 3;
export const EVICTION_POLICIES = ['value', 'full'];
// The sizing guide's overhead_percentage: memory the bucket uses beyond the metadata and working set it counts.
export const OVERHEAD = 0.25;

/** Documented minimums, in MiB per node, for the service quotas and for a bucket. */
export const MIN_QUOTA_MIB = { data: 256, index: 256, search: 256, eventing: 256, analytics: 1024 };
export const MIN_BUCKET_MIB = 100;

/**
 * Couchbase recommends giving the server and its services no more than 90% of a node's memory, 80% on nodes
 * with little memory, and refuses quotas above max(RAM − 1 GiB, 80% × RAM). The docs don't define "little";
 * below 5 GiB the firm limit itself is 80%, so that's where the stricter share applies here.
 */
export const RECOMMENDED_QUOTA_SHARE = 0.9;
export const SMALL_NODE_QUOTA_SHARE = 0.8;
export const SMALL_NODE_MIB = 5 * 1024;

/** Below this working set, a full-ejection bucket sends most reads and existence checks to disk. Our threshold. */
export const FULL_EJECTION_LOW_WORKING_SET_PCT = 20;

/** Couchbase's guidance: a bucket quota of at least 10% of the dataset (Couchstore; 1% for Magma). */
export const MIN_DATASET_SHARE = 0.1;
export const MIN_DATASET_SHARE_BY_ENGINE = { couchstore: MIN_DATASET_SHARE, magma: 0.01 };
export const STORAGE_ENGINES = Object.keys(MIN_DATASET_SHARE_BY_ENGINE);
const ENGINE_LABELS = { couchstore: 'Couchstore', magma: 'Magma' };

/** The values calculateSizing() uses unless `settings` replaces them. */
export const DEFAULT_SETTINGS = {
  metadataBytes: METADATA_BYTES,
  overhead: OVERHEAD,
  highWaterMark: HIGH_WATER_MARK,
  smallNodeMiB: SMALL_NODE_MIB,
  lowWorkingSetPct: FULL_EJECTION_LOW_WORKING_SET_PCT,
  storageEngine: 'couchstore'
};

export function firmQuotaLimitMiB(nodeRamMiB) {
  return Math.max(nodeRamMiB - 1024, 0.8 * nodeRamMiB);
}

export function recommendedQuotaShare(nodeRamMiB, smallNodeMiB = SMALL_NODE_MIB) {
  return nodeRamMiB < smallNodeMiB ? SMALL_NODE_QUOTA_SHARE : RECOMMENDED_QUOTA_SHARE;
}

function checkSettings(settings) {
  const { metadataBytes, overhead, highWaterMark, smallNodeMiB, lowWorkingSetPct, storageEngine } = settings;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  if (!finite(metadataBytes) || metadataBytes < 0) throw new RangeError(`metadataBytes must be a non-negative number (got ${metadataBytes})`);
  if (!finite(overhead) || overhead < 0) throw new RangeError(`overhead must be a non-negative number (got ${overhead})`);
  if (!finite(highWaterMark) || !(highWaterMark > 0 && highWaterMark <= 1)) {
    throw new RangeError(`highWaterMark must be above 0 and at most 1 (got ${highWaterMark})`);
  }
  if (!finite(smallNodeMiB) || smallNodeMiB < 0) throw new RangeError(`smallNodeMiB must be a non-negative number (got ${smallNodeMiB})`);
  if (!finite(lowWorkingSetPct) || lowWorkingSetPct < 0 || lowWorkingSetPct > 100) {
    throw new RangeError(`lowWorkingSetPct must be from 0 to 100 (got ${lowWorkingSetPct})`);
  }
  if (!STORAGE_ENGINES.includes(storageEngine)) {
    throw new RangeError(`storageEngine must be one of ${STORAGE_ENGINES.join(', ')} (got ${storageEngine})`);
  }
}

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

// Kept short on purpose: the details, sources and assumptions are on the guide page (/couchbase/how-it-works/).
const NOTE =
  'Index, Search, Eventing and Analytics quotas are the values you entered. Full-ejection buckets count only the ' +
  'metadata of documents kept in RAM — an assumption. bucket-edit only changes buckets that already exist.';

function assertNonNegativeNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number (got ${value})`);
  }
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer (got ${value})`);
}

function sizeBucket(bucket, { metadataBytes, overhead, highWaterMark }, dataNodes) {
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
  const metadataMiB = (documents * (metadataBytes + keyBytes) * copies) / MIB;
  const datasetMiB = (documents * documentBytes * copies) / MIB;
  const residentMetadataMiB = eviction === 'value' ? metadataMiB : metadataMiB * workingSet;
  const residentDataMiB = datasetMiB * workingSet;
  // What the bucket needs across the cluster; vBuckets spread it evenly over the Data nodes.
  const rawQuotaMiB = ((residentMetadataMiB + residentDataMiB) * (1 + overhead)) / highWaterMark;
  const rawNodeQuotaMiB = rawQuotaMiB / dataNodes;

  return {
    name: name.trim(),
    replicas,
    eviction,
    metadataMiB,
    datasetMiB,
    residentMetadataMiB,
    residentDataMiB,
    workingSetPct,
    rawQuotaMiB,
    rawNodeQuotaMiB,
    quotaMiB: Math.max(MIN_BUCKET_MIB, roundUpToMultiple(rawNodeQuotaMiB, STEP_MIB))
  };
}

/**
 * @param {object} input
 * @param {Array<object>} input.buckets - name, documents, keyBytes, documentBytes, replicas, workingSetPct, eviction
 * @param {number} input.dataNodes - nodes running the Data service
 * @param {number} input.nodeRamMiB - RAM of one node
 * @param {object} [input.services] - per-node quota in MiB for index/search/eventing/analytics; 0 or absent = not running
 * @param {object} [input.settings] - replaces any of DEFAULT_SETTINGS
 * @throws {RangeError} on invalid input, rather than silently coercing it
 */
export function calculateSizing({ buckets, dataNodes, nodeRamMiB, services = {}, settings: overrides = {} }) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  checkSettings(settings);
  if (!Array.isArray(buckets) || buckets.length === 0) throw new RangeError('at least one bucket is required');
  assertPositiveInteger('dataNodes', dataNodes);
  if (typeof nodeRamMiB !== 'number' || !Number.isFinite(nodeRamMiB) || nodeRamMiB <= 0) {
    throw new RangeError(`nodeRamMiB must be a positive number (got ${nodeRamMiB})`);
  }
  const names = buckets.map((bucket) => String(bucket.name).trim());
  if (new Set(names).size !== names.length) throw new RangeError('bucket names must be unique');

  const sized = buckets.map((bucket) => sizeBucket(bucket, settings, dataNodes));
  // Bucket quotas are per node, so the Data quota on each node has to hold all of them.
  const bucketsTotalMiB = sized.reduce((sum, bucket) => sum + bucket.quotaMiB, 0);

  const quotas = { data: Math.max(MIN_QUOTA_MIB.data, bucketsTotalMiB) };
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
  const firmLimitMiB = firmQuotaLimitMiB(nodeRamMiB);
  const recommendedShare = recommendedQuotaShare(nodeRamMiB, settings.smallNodeMiB);
  const minDatasetShare = MIN_DATASET_SHARE_BY_ENGINE[settings.storageEngine];
  if (quotaTotalMiB > firmLimitMiB) {
    warnings.push({
      level: 'error',
      code: 'quotas-exceed-limit',
      message:
        `Service quotas total ${quotaTotalMiB} MiB, above the ${Math.floor(firmLimitMiB)} MiB Couchbase allows on a node with ` +
        `${Math.round(nodeRamMiB)} MiB of RAM, so it will refuse them. Add nodes or RAM, or lower the working set.`
    });
  } else if (quotaShare > recommendedShare) {
    warnings.push({
      level: 'warning',
      code: 'quotas-high-share',
      message:
        `Service quotas use ${Math.round(quotaShare * 100)}% of the node's RAM; Couchbase recommends at most ` +
        `${Math.round(recommendedShare * 100)}%, to leave room for the OS, its file cache and the Query service.`
    });
  }

  for (const bucket of sized) {
    if (bucket.rawNodeQuotaMiB < MIN_BUCKET_MIB) {
      warnings.push({
        level: 'warning',
        code: 'bucket-at-minimum',
        message: `Bucket "${bucket.name}" needs less than Couchbase's ${MIN_BUCKET_MIB} MiB per node minimum, so it was raised to that.`
      });
    }
    // The dataset is cluster-wide, so compare it with the bucket's quota on all Data nodes together.
    if (bucket.quotaMiB * dataNodes < bucket.datasetMiB * minDatasetShare) {
      warnings.push({
        level: 'warning',
        code: 'bucket-below-dataset-share',
        message:
          `Bucket "${bucket.name}" gets ${bucket.quotaMiB * dataNodes} MiB across the Data nodes for ${Math.round(bucket.datasetMiB)} MiB of data; Couchbase ` +
          `recommends a quota of at least ${Math.round(minDatasetShare * 100)}% of the dataset for ${ENGINE_LABELS[settings.storageEngine]}` +
          (settings.storageEngine === 'couchstore' ? ' (1% for Magma).' : '.')
      });
    }
    if (bucket.eviction === 'full' && bucket.workingSetPct < settings.lowWorkingSetPct) {
      warnings.push({
        level: 'warning',
        code: 'full-ejection-low-working-set',
        message:
          `Bucket "${bucket.name}" uses full ejection with ${bucket.workingSetPct}% in RAM: reads of other documents, and ` +
          'existence checks on keys not in RAM, go to disk. Expect higher latency; the Magma storage engine reduces the cost.'
      });
    }
  }

  return {
    buckets: sized,
    dataNodes,
    nodeRamMiB,
    bucketsTotalMiB,
    quotas,
    quotaTotalMiB,
    quotaShare,
    settings,
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

/** The calculation as three steps, whatever the number of buckets: bucket quotas, Data quota, total. */
function explainSteps(sizing) {
  const { buckets, dataNodes, bucketsTotalMiB, quotas, quotaTotalMiB, quotaShare, settings } = sizing;
  const factor = (value) => Number(value.toFixed(4));
  return [
    {
      label: buckets.length === 1 ? 'Bucket' : 'Each bucket',
      text:
        `(metadata + working set in RAM) × ${factor(1 + settings.overhead)} ÷ ${factor(settings.highWaterMark)} ÷ ` +
        `${pluralize(dataNodes, 'Data node')} → ${buckets.map((b) => `${b.name} ${b.quotaMiB} MiB`).join(', ')} per node`
    },
    {
      label: 'Data quota',
      text:
        (buckets.length === 1 ? `the bucket's ${bucketsTotalMiB} MiB` : `the buckets' ${bucketsTotalMiB} MiB together`) +
        (quotas.data > bucketsTotalMiB ? `, raised to Couchbase's ${MIN_QUOTA_MIB.data} MiB minimum` : '') +
        ` → ${quotas.data} MiB per node`
    },
    { label: 'All quotas', text: `${quotaTotalMiB} MiB per node, ${Math.round(quotaShare * 100)}% of the node's RAM` }
  ];
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
    detail: `${bucket.replicas} ${bucket.replicas === 1 ? 'replica' : 'replicas'}, per Data node`
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
    // The same steps as one string, for the result shape every formatter shares; the page shows them as a list.
    explanationSteps: explainSteps(sizing),
    explanation: explainSteps(sizing).map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
