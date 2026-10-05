/**
 * Turns pasted Couchbase monitoring output into form values for the
 * Couchbase calculator. Pure: no DOM access.
 *
 * Understands three kinds of paste, detected automatically:
 *   - Prometheus exposition text from a node's `/metrics` endpoint:
 *     `kv_curr_items{bucket="orders"} 1200000`
 *   - Prometheus HTTP API JSON (`/api/v1/query`, `/api/v1/query_range`) for the same metrics
 *   - Couchbase REST JSON: `/pools/default/buckets` (an array, or one bucket from
 *     `/pools/default/buckets/<name>`) and `/pools/default` (cluster quotas and nodes)
 *
 * What each can supply:
 *   - Prometheus: document count per bucket (`kv_curr_items`, active items summed over
 *     the nodes' series, peak per series) and the current bucket quota per node (`kv_ep_cache_size`).
 *   - Bucket REST JSON: name, item count, replicas, eviction policy and the current quota per node.
 *   - Cluster REST JSON: node RAM, number of Data nodes and each service's quota.
 * Document and key sizes aren't in any of them reliably, so they're never guessed.
 */

const BYTES_IN_MIB = 1024 * 1024;
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const SERIES_LINE = /^([A-Za-z_:][A-Za-z0-9_:]*)(\{.*\})?\s+(\S+)(?:\s+\S+)?$/;
const LABEL = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

const EVICTION = { valueOnly: 'value', fullEviction: 'full' };
const SERVICE_BY_NAME = { index: 'index', fts: 'search', eventing: 'eventing', cbas: 'analytics' };
const QUOTA_FIELDS = {
  index: 'indexMemoryQuota',
  search: 'ftsMemoryQuota',
  eventing: 'eventingMemoryQuota',
  analytics: 'cbasMemoryQuota'
};

const isCount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// ---- Prometheus --------------------------------------------------------

function parseLabels(text) {
  const labels = {};
  for (const [, name, value] of text.matchAll(LABEL)) labels[name] = value.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch));
  return labels;
}

function seriesFromExposition(text) {
  const series = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = SERIES_LINE.exec(line);
    if (!match || !NUMBER.test(match[3])) continue;
    series.push({ name: match[1], labels: match[2] ? parseLabels(match[2]) : {}, values: [Number(match[3])] });
  }
  return series;
}

function seriesFromApiJson(json) {
  return json.data.result.map(({ metric = {}, value, values }) => {
    const { __name__: name = '', ...labels } = metric;
    const samples = values ?? (value ? [value] : []);
    return { name, labels, values: samples.map((sample) => Number(sample[1])).filter(Number.isFinite) };
  });
}

const peakOf = ({ values }) => (values.length ? Math.max(...values) : 0);

/** Peak per series, summed over the series of a bucket (one per node). */
function sumOfPeaks(series) {
  return series.reduce((sum, entry) => sum + peakOf(entry), 0);
}

/** Peak per series, the largest of a bucket's series: for per-node values such as the quota. */
function maxOfPeaks(series) {
  return series.reduce((max, entry) => Math.max(max, peakOf(entry)), 0);
}

/** Repeated lines with the same labels are samples of one series (a range paste), not extra nodes. */
function mergeSeries(series) {
  const merged = new Map();
  for (const { name, labels, values } of series) {
    const key = `${name}${JSON.stringify(Object.entries(labels).sort())}`;
    if (merged.has(key)) merged.get(key).values.push(...values);
    else merged.set(key, { name, labels, values: [...values] });
  }
  return [...merged.values()];
}

function bucketsFromSeries(series) {
  const byBucket = new Map();
  for (const entry of mergeSeries(series)) {
    const bucket = entry.labels.bucket;
    if (!bucket || !['kv_curr_items', 'kv_ep_cache_size'].includes(entry.name)) continue;
    if (!byBucket.has(bucket)) byBucket.set(bucket, { items: [], quota: [] });
    byBucket.get(bucket)[entry.name === 'kv_curr_items' ? 'items' : 'quota'].push(entry);
  }
  return [...byBucket].map(([name, { items, quota }]) => ({
    name,
    ...(items.length ? { documents: Math.round(sumOfPeaks(items)) } : {}),
    // kv_ep_cache_size is the bucket's quota on that node, the same on every node: not summed.
    ...(quota.length ? { currentQuotaMiB: Math.round(maxOfPeaks(quota) / BYTES_IN_MIB) } : {})
  }));
}

// ---- Couchbase REST JSON -------------------------------------------------

function bucketFromRest(bucket) {
  const documents = bucket.basicStats?.itemCount;
  // quota.rawRAM is the per-node quota the calculator works in; quota.ram is that times the Data nodes.
  const quotaBytes = bucket.quota?.rawRAM;
  return {
    name: bucket.name,
    ...(isCount(documents) ? { documents } : {}),
    ...(Number.isInteger(bucket.replicaNumber) ? { replicas: bucket.replicaNumber } : {}),
    ...(EVICTION[bucket.evictionPolicy] ? { eviction: EVICTION[bucket.evictionPolicy] } : {}),
    ...(isCount(quotaBytes) ? { currentQuotaMiB: Math.round(quotaBytes / BYTES_IN_MIB) } : {})
  };
}

const looksLikeBucket = (value) =>
  value !== null && typeof value === 'object' && typeof value.name === 'string' && ('basicStats' in value || 'quota' in value || 'bucketType' in value);

function bucketsFromRest(list) {
  const buckets = [];
  const skipped = [];
  for (const bucket of list) {
    if (bucket.bucketType === 'ephemeral' || bucket.bucketType === 'memcached') {
      skipped.push({ name: bucket.name, reason: `${bucket.bucketType} bucket` });
    } else {
      buckets.push(bucketFromRest(bucket));
    }
  }
  return { buckets, skipped };
}

function clusterFromRest(info) {
  const cluster = {};
  const nodes = Array.isArray(info.nodes) ? info.nodes : [];
  const withServices = nodes.filter((node) => Array.isArray(node.services));
  const dataNodes = withServices.length ? withServices.filter((node) => node.services.includes('kv')) : nodes;

  if (dataNodes.length) cluster.dataNodes = dataNodes.length;
  const ramBytes = (dataNodes.length ? dataNodes : nodes)
    .map((node) => node.systemStats?.mem_total ?? node.memoryTotal)
    .filter(isCount);
  if (ramBytes.length) cluster.nodeRamMiB = Math.min(...ramBytes) / BYTES_IN_MIB;
  if (isCount(info.memoryQuota)) cluster.dataQuotaMiB = info.memoryQuota;

  const running = new Set(withServices.flatMap((node) => node.services.map((name) => SERVICE_BY_NAME[name]).filter(Boolean)));
  const services = {};
  for (const [service, field] of Object.entries(QUOTA_FIELDS)) {
    if (withServices.length && !running.has(service)) services[service] = 0;
    else if (isCount(info[field])) services[service] = info[field];
  }
  if (Object.keys(services).length) cluster.services = services;
  return cluster;
}

// ---- entry point -----------------------------------------------------------

/**
 * @param {string} text - whatever the user pasted
 * @returns {{ kind: 'prometheus'|'buckets'|'cluster'|'unknown', buckets: object[], cluster: object, skipped: object[], error?: string }}
 *   buckets: { name, documents?, replicas?, eviction?, currentQuotaMiB? }
 *   cluster: { nodeRamMiB?, dataNodes?, dataQuotaMiB?, services? }
 */
export function parseCouchbaseInput(text) {
  const result = { kind: 'unknown', buckets: [], cluster: {}, skipped: [] };
  const trimmed = text.trim();
  if (!trimmed) return result;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return { ...result, error: 'That looks like JSON, but it isn’t valid — copy the whole response.' };
    }
    if (json && json.status === 'success' && Array.isArray(json.data?.result)) {
      return { ...result, kind: 'prometheus', buckets: bucketsFromSeries(seriesFromApiJson(json)) };
    }
    const list = Array.isArray(json) ? json : looksLikeBucket(json) ? [json] : null;
    if (list && list.length && list.every(looksLikeBucket)) {
      return { ...result, kind: 'buckets', ...bucketsFromRest(list) };
    }
    if (json && !Array.isArray(json) && typeof json === 'object' && ('memoryQuota' in json || 'nodes' in json)) {
      return { ...result, kind: 'cluster', cluster: clusterFromRest(json) };
    }
    return result;
  }

  const buckets = bucketsFromSeries(seriesFromExposition(trimmed));
  return buckets.length ? { ...result, kind: 'prometheus', buckets } : result;
}
