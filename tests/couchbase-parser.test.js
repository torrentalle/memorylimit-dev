import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCouchbaseInput } from '../public/js/couchbase-parser.js';

const EXPOSITION = [
  '# HELP kv_curr_items Count of alive items',
  '# TYPE kv_curr_items gauge',
  'kv_curr_items{bucket="orders",instance="n1:8091"} 400000',
  'kv_curr_items{bucket="orders",instance="n2:8091"} 800000',
  'kv_curr_items{bucket="sessions",instance="n1:8091"} 5000',
  'kv_ep_cache_size{bucket="orders",instance="n1:8091"} 1073741824',
  'kv_ep_cache_size{bucket="orders",instance="n2:8091"} 1073741824',
  'kv_mem_used_bytes{bucket="orders",instance="n1:8091"} 12345',
  'sysproc_mem_resident{proc="ns_server"} 99'
].join('\n');

const BUCKET_API = [
  { name: 'travel', bucketType: 'membase', replicaNumber: 2, evictionPolicy: 'fullEviction', quota: { ram: 209715200, rawRAM: 69905067 }, basicStats: { itemCount: 63321, memUsed: 137835864 } },
  { name: 'cache', bucketType: 'ephemeral', replicaNumber: 1, evictionPolicy: 'noEviction', quota: { ram: 104857600 }, basicStats: { itemCount: 10 } },
  { name: 'users', bucketType: 'membase', replicaNumber: 1, evictionPolicy: 'valueOnly', quota: { ram: 536870912, rawRAM: 268435456 }, basicStats: { itemCount: 1000000 } },
  { name: 'logs', bucketType: 'membase', replicaNumber: 0, evictionPolicy: 'valueOnly', quota: { ram: 314572800 }, basicStats: { itemCount: 5 } }
];

const CLUSTER_API = {
  memoryQuota: 4096,
  indexMemoryQuota: 1024,
  ftsMemoryQuota: 512,
  eventingMemoryQuota: 256,
  cbasMemoryQuota: 1024,
  nodes: [
    { services: ['kv', 'index', 'n1ql'], systemStats: { mem_total: 17179869184 } },
    { services: ['kv', 'index', 'n1ql'], systemStats: { mem_total: 34359738368 } },
    { services: ['n1ql'], systemStats: { mem_total: 8589934592 } }
  ]
};

test('Prometheus exposition: sums each bucket’s items across nodes and reads the current quota per node', () => {
  const result = parseCouchbaseInput(EXPOSITION);
  assert.equal(result.kind, 'prometheus');
  assert.deepEqual(result.buckets, [
    // kv_ep_cache_size is 1 GiB on each of the two nodes: a 1024 MiB quota per node, not 2048.
    { name: 'orders', documents: 1200000, currentQuotaMiB: 1024 },
    { name: 'sessions', documents: 5000 }
  ]);
});

test('Prometheus range data uses each series’ peak, not the sum of every sample', () => {
  const text = ['kv_curr_items{bucket="a",instance="n1"} 100', 'kv_curr_items{bucket="a",instance="n1"} 150', 'kv_curr_items{bucket="a",instance="n2"} 70'].join('\n');
  assert.equal(parseCouchbaseInput(text).buckets[0].documents, 220);
});

test('nodes’ own /metrics (no instance label) are added up, one line per node, and the count says how many nodes', () => {
  const node = 'kv_curr_items{bucket="orders"} 1000000';
  assert.deepEqual(parseCouchbaseInput(node).buckets, [{ name: 'orders', documents: 1000000, documentsFromNodes: 1 }]);
  // Three nodes' output pasted together: identical lines, which are nodes, not samples over time.
  const quota = 'kv_ep_cache_size{bucket="orders"} 1073741824';
  const three = [node, node, node, quota, quota, quota].join('\n');
  assert.deepEqual(parseCouchbaseInput(three).buckets, [{ name: 'orders', documents: 3000000, documentsFromNodes: 3, currentQuotaMiB: 1024 }]);
});

test('an aggregated query result, which has no metric name, is read as the item count and flagged', () => {
  const json = { status: 'success', data: { resultType: 'vector', result: [{ metric: { bucket: 'orders' }, value: [1727260000, '3000000'] }] } };
  assert.deepEqual(parseCouchbaseInput(JSON.stringify(json)).buckets, [{ name: 'orders', documents: 3000000, documentsFromUnnamedSeries: true }]);
});

test('Prometheus exposition accepts timestamps, escaped label values and CRLF line endings', () => {
  const text = 'kv_curr_items{bucket="my\\"b",instance="n1"} 1.5e3 1727260000123\r\n';
  assert.deepEqual(parseCouchbaseInput(text).buckets, [{ name: 'my"b', documents: 1500 }]);
});

test('Prometheus HTTP API JSON, instant and range results', () => {
  const instant = { status: 'success', data: { resultType: 'vector', result: [{ metric: { __name__: 'kv_curr_items', bucket: 'orders', instance: 'n1' }, value: [1727260000, '400000'] }, { metric: { __name__: 'kv_curr_items', bucket: 'orders', instance: 'n2' }, value: [1727260000, '800000'] }] } };
  assert.deepEqual(parseCouchbaseInput(JSON.stringify(instant)).buckets, [{ name: 'orders', documents: 1200000 }]);

  const range = { status: 'success', data: { resultType: 'matrix', result: [{ metric: { __name__: 'kv_curr_items', bucket: 'orders' }, values: [[1, '10'], [2, '30'], [3, '20']] }] } };
  assert.equal(parseCouchbaseInput(JSON.stringify(range)).buckets[0].documents, 30);
});

test('bucket REST JSON: items, replicas, eviction and quota per node; ephemeral buckets are skipped', () => {
  const result = parseCouchbaseInput(JSON.stringify(BUCKET_API));
  assert.equal(result.kind, 'buckets');
  assert.deepEqual(result.buckets, [
    // quota.rawRAM is per node; quota.ram (the cluster total) is never used, so logs, without rawRAM, has no quota.
    { name: 'travel', documents: 63321, replicas: 2, eviction: 'full', currentQuotaMiB: 67 },
    { name: 'users', documents: 1000000, replicas: 1, eviction: 'value', currentQuotaMiB: 256 },
    { name: 'logs', documents: 5, replicas: 0, eviction: 'value' }
  ]);
  assert.deepEqual(result.skipped, [{ name: 'cache', reason: 'ephemeral bucket' }]);
});

test('a single bucket object from /pools/default/buckets/<name> works too', () => {
  const result = parseCouchbaseInput(JSON.stringify(BUCKET_API[0]));
  assert.equal(result.kind, 'buckets');
  assert.equal(result.buckets[0].name, 'travel');
});

test('cluster REST JSON: Data nodes, smallest Data node RAM and the quotas of the services that run', () => {
  const { kind, cluster } = parseCouchbaseInput(JSON.stringify(CLUSTER_API));
  assert.equal(kind, 'cluster');
  assert.equal(cluster.dataNodes, 2);
  assert.equal(cluster.nodeRamMiB, 16384);
  assert.equal(cluster.dataQuotaMiB, 4096);
  // Search, Eventing and Analytics don't run on any node, so their quota is 0 whatever the setting says.
  assert.deepEqual(cluster.services, { index: 1024, search: 0, eventing: 0, analytics: 0 });
});

test('cluster JSON without a nodes list still returns the quotas that are there', () => {
  const { cluster } = parseCouchbaseInput(JSON.stringify({ memoryQuota: 1024, indexMemoryQuota: 512 }));
  assert.deepEqual(cluster, { dataQuotaMiB: 1024, services: { index: 512 } });
});

test('nodes without service lists all count as Data nodes', () => {
  const { cluster } = parseCouchbaseInput(JSON.stringify({ nodes: [{ systemStats: { mem_total: 1073741824 } }, { systemStats: { mem_total: 2147483648 } }] }));
  assert.equal(cluster.dataNodes, 2);
  assert.equal(cluster.nodeRamMiB, 1024);
});

test('unrecognised input is reported as unknown, invalid JSON as an error', () => {
  for (const text of ['', '   ', 'hello world', 'used_memory:419430400', '{"unrelated": true}', '[]', '[1, 2, 3]', 'kv_mem_used_bytes{bucket="a"} 5']) {
    const result = parseCouchbaseInput(text);
    assert.equal(result.kind, 'unknown', text);
    assert.deepEqual(result.buckets, []);
  }
  assert.match(parseCouchbaseInput('{"memoryQuota": 12').error, /valid/);
});

test('series without a bucket label, and other metrics, are ignored', () => {
  const result = parseCouchbaseInput('kv_curr_items 5\nkv_curr_items{bucket="a"} 7\ncm_http_requests_total{bucket="a"} 9');
  assert.deepEqual(result.buckets, [{ name: 'a', documents: 7, documentsFromNodes: 1 }]);
});
