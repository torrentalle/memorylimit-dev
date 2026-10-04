import test from 'node:test';
import assert from 'node:assert/strict';
import * as couchbase from '../../public/js/formatters/couchbase.js';

const BUCKET = { name: 'default', documents: 1000000, keyBytes: 36, documentBytes: 1024, replicas: 1, workingSetPct: 20, eviction: 'value' };
const INPUT = { buckets: [BUCKET], dataNodes: 3, nodeRamMiB: 16384, services: { index: 512 }, headroom: 'medium' };
const sizing = (overrides = {}) => couchbase.calculateSizing({ ...INPUT, ...overrides });
const bucketWith = (overrides) => ({ ...BUCKET, ...overrides });

test('golden: exact commands for a known input', () => {
  // metadata 1M × 92 B × 2 = 175.5 MiB; resident data 1M × 1 KiB × 2 × 20% = 390.6 MiB
  // (175.5 + 390.6) × 1.25 ÷ 0.85 = 832.5 → 896 MiB; 896 ÷ 3 nodes = 298.7 → 320 MiB per node
  const result = couchbase.format(INPUT);
  assert.equal(
    result.snippet.code,
    [
      'couchbase-cli setting-cluster -c localhost:8091 -u Administrator -p "$CB_PASSWORD" \\',
      '  --cluster-ramsize 320 \\',
      '  --cluster-index-ramsize 512',
      'couchbase-cli bucket-edit -c localhost:8091 -u Administrator -p "$CB_PASSWORD" --bucket default --bucket-ramsize 896'
    ].join('\n')
  );
  assert.equal(
    result.alternative.code,
    'curl -u Administrator:"$CB_PASSWORD" -X POST http://localhost:8091/pools/default \\\n  -d memoryQuota=320 \\\n  -d indexMemoryQuota=512'
  );
});

test('bucket quota follows the documented formula and rounds up to 64 MiB', () => {
  const [bucket] = sizing().buckets;
  assert.ok(Math.abs(bucket.metadataMiB - 175.48) < 0.01);
  assert.ok(Math.abs(bucket.residentDataMiB - 390.63) < 0.01);
  assert.equal(bucket.quotaMiB, 896);
  assert.equal(bucket.quotaMiB % couchbase.STEP_MIB, 0);
});

test('replicas multiply both metadata and data', () => {
  const none = sizing({ buckets: [bucketWith({ replicas: 0 })] }).buckets[0];
  const two = sizing({ buckets: [bucketWith({ replicas: 2 })] }).buckets[0];
  assert.ok(Math.abs(two.metadataMiB - 1.5 * 2 * none.metadataMiB) < 1e-6);
  assert.ok(two.rawQuotaMiB > none.rawQuotaMiB * 2.9 && two.rawQuotaMiB < none.rawQuotaMiB * 3.1);
});

test('full ejection counts only the working-set share of the metadata', () => {
  const value = sizing().buckets[0];
  const full = sizing({ buckets: [bucketWith({ eviction: 'full' })] }).buckets[0];
  assert.equal(full.metadataMiB, value.metadataMiB);
  assert.ok(Math.abs(full.residentMetadataMiB - value.metadataMiB * 0.2) < 1e-6);
  assert.ok(full.quotaMiB < value.quotaMiB);
});

test('a larger working set or more headroom never lowers the quota', () => {
  const quota = (overrides, headroom) => sizing({ buckets: [bucketWith(overrides)], headroom }).buckets[0].rawQuotaMiB;
  assert.ok(quota({ workingSetPct: 50 }, 'medium') > quota({ workingSetPct: 20 }, 'medium'));
  assert.ok(quota({}, 'high') > quota({}, 'medium'));
  assert.ok(quota({}, 'medium') > quota({}, 'low'));
});

test('a tiny bucket is raised to the minimum and flagged', () => {
  const result = sizing({ buckets: [bucketWith({ documents: 1000 })] });
  assert.equal(result.buckets[0].quotaMiB, couchbase.MIN_BUCKET_MIB);
  assert.ok(result.warnings.some((w) => w.code === 'bucket-at-minimum'));
});

test('the Data quota splits the bucket total across the Data nodes, never below the minimum', () => {
  const buckets = [bucketWith({ name: 'a' }), bucketWith({ name: 'b', documents: 2000000 })];
  const one = sizing({ buckets, dataNodes: 1 });
  const four = sizing({ buckets, dataNodes: 4 });
  assert.equal(one.quotas.data, one.bucketsTotalMiB);
  assert.equal(four.quotas.data, Math.ceil(four.bucketsTotalMiB / 4 / couchbase.STEP_MIB) * couchbase.STEP_MIB);
  assert.equal(sizing({ dataNodes: 50 }).quotas.data, couchbase.MIN_QUOTA_MIB.data);
});

test('services entered as 0 or left out are not part of the quotas or the commands', () => {
  const result = couchbase.format({ ...INPUT, services: { index: 0, search: 0 } });
  assert.deepEqual(Object.keys(result.sizing.quotas), ['data']);
  assert.doesNotMatch(result.snippet.code, /index-ramsize|fts-ramsize/);
});

test('every enabled service gets its own flag and REST field', () => {
  const result = couchbase.format({ ...INPUT, services: { index: 512, search: 512, eventing: 256, analytics: 1024 } });
  for (const flag of ['--cluster-ramsize', '--cluster-index-ramsize', '--cluster-fts-ramsize', '--cluster-eventing-ramsize', '--cluster-analytics-ramsize']) {
    assert.ok(result.snippet.code.includes(flag), flag);
  }
  for (const field of ['memoryQuota', 'indexMemoryQuota', 'ftsMemoryQuota', 'eventingMemoryQuota', 'cbasMemoryQuota']) {
    assert.ok(result.alternative.code.includes(field), field);
  }
});

test('a service quota below its minimum is an error', () => {
  const result = sizing({ services: { index: 128, analytics: 512 } });
  assert.deepEqual(
    result.warnings.filter((w) => w.level === 'error').map((w) => w.code),
    ['index-below-minimum', 'analytics-below-minimum']
  );
});

test('the firm limit is max(RAM − 1 GiB, 80% × RAM), as documented', () => {
  assert.equal(couchbase.firmQuotaLimitMiB(16384), 15360);
  assert.equal(couchbase.firmQuotaLimitMiB(4096), 3276.8);
  assert.equal(couchbase.firmQuotaLimitMiB(5120), 4096);
});

test('the recommended share is 90%, or 80% on nodes under 5 GiB', () => {
  assert.equal(couchbase.recommendedQuotaShare(16384), 0.9);
  assert.equal(couchbase.recommendedQuotaShare(5120), 0.9);
  assert.equal(couchbase.recommendedQuotaShare(4096), 0.8);
});

test('quotas above the firm limit are an error, above the recommended share a warning, below that silent', () => {
  // data 320 MiB + index; 16 GiB node: 90% = 14745.6 MiB, firm limit 15360 MiB
  const codes = (index, nodeRamMiB = 16384) => sizing({ nodeRamMiB, services: { index } }).warnings.map((w) => `${w.level}:${w.code}`);
  assert.deepEqual(codes(512), []);
  assert.deepEqual(codes(14800), ['warning:quotas-high-share']);
  assert.deepEqual(codes(15100), ['error:quotas-exceed-limit']);
  // 832 MiB on a 1 GiB node: firm limit 819.2 MiB
  assert.deepEqual(codes(512, 1024), ['error:quotas-exceed-limit']);
});

test('a bucket quota under 10% of its dataset is flagged', () => {
  const low = sizing({ buckets: [bucketWith({ workingSetPct: 1, eviction: 'full' })] });
  assert.ok(low.warnings.some((w) => w.code === 'bucket-below-dataset-share'));
  assert.ok(!sizing().warnings.some((w) => w.code === 'bucket-below-dataset-share'));
});

test('the figures list every quota and end with the per-node total', () => {
  const { figures } = couchbase.format({ ...INPUT, buckets: [BUCKET, bucketWith({ name: 'sessions', replicas: 0 })] });
  assert.deepEqual(
    figures.map((f) => f.label),
    ['Data quota', 'Index quota', 'Bucket default', 'Bucket sessions', 'Quotas per node']
  );
  assert.equal(figures.at(-1).role, 'total');
});

test('the note says the quotas are per node and that Query has none', () => {
  const { note } = couchbase.format(INPUT);
  assert.match(note, /per node/);
  assert.match(note, /Query service has no quota/);
});

test('the note covers bucket-edit limits and the CLI wording for --cluster-ramsize', () => {
  const { note } = couchbase.format(INPUT);
  assert.match(note, /bucket-edit.*already exist/);
  assert.match(note, /bucket-create/);
  assert.match(note, /lowered/);
  assert.match(note, /future nodes/);
});

test('rejects invalid input rather than coercing it', () => {
  assert.throws(() => sizing({ buckets: [] }), RangeError);
  assert.throws(() => sizing({ dataNodes: 0 }), RangeError);
  assert.throws(() => sizing({ dataNodes: 1.5 }), RangeError);
  assert.throws(() => sizing({ nodeRamMiB: 0 }), RangeError);
  assert.throws(() => sizing({ headroom: 'extreme' }), RangeError);
  assert.throws(() => sizing({ services: { index: -1 } }), RangeError);
  assert.throws(() => sizing({ buckets: [bucketWith({ replicas: 4 })] }), RangeError);
  assert.throws(() => sizing({ buckets: [bucketWith({ workingSetPct: 0 })] }), RangeError);
  assert.throws(() => sizing({ buckets: [bucketWith({ workingSetPct: 101 })] }), RangeError);
  assert.throws(() => sizing({ buckets: [bucketWith({ eviction: 'none' })] }), RangeError);
  assert.throws(() => sizing({ buckets: [bucketWith({ documents: null })] }), RangeError);
  assert.throws(() => sizing({ buckets: [bucketWith({ name: '  ' })] }), RangeError);
  assert.throws(() => sizing({ buckets: [BUCKET, BUCKET] }), RangeError);
});
