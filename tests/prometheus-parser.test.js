import test from 'node:test';
import assert from 'node:assert/strict';
import * as Parser from '../public/js/prometheus-parser.js';

test('parses standard exposition lines with byte values', () => {
  const text = [
    'container_memory_working_set_bytes{pod="api-7c9"} 187245312',
    'container_memory_working_set_bytes{pod="api-7c9"} 199512064'
  ].join('\n');
  const samples = Parser.parseSamples(text);
  assert.deepEqual(samples, [187245312, 199512064]);
});

test('handles scientific notation values', () => {
  const samples = Parser.parseSamples('container_memory_working_set_bytes{pod="x"} 1.887e+08');
  assert.equal(samples.length, 1);
  assert.ok(Math.abs(samples[0] - 188700000) < 1);
});

test('ignores comment / HELP / TYPE lines', () => {
  const text = [
    '# HELP container_memory_working_set_bytes Current working set',
    '# TYPE container_memory_working_set_bytes gauge',
    'container_memory_working_set_bytes{pod="x"} 100000000'
  ].join('\n');
  assert.deepEqual(Parser.parseSamples(text), [100000000]);
});

test('ignores digits inside label matchers', () => {
  const samples = Parser.parseSamples('container_memory_working_set_bytes{pod="api-7",replica="2"} 100000000');
  assert.deepEqual(samples, [100000000]);
});

test('handles an exposition line with a trailing timestamp', () => {
  const samples = Parser.parseSamples('container_memory_working_set_bytes{pod="x"} 104857600 1699999999999');
  assert.deepEqual(samples, [104857600]);
});

test('parses a plain list of numbers, one per line', () => {
  const samples = Parser.parseSamples('410\n512\n630');
  assert.deepEqual(samples, [410, 512, 630]);
});

test('parses comma-separated numbers on a single line', () => {
  const samples = Parser.parseSamples('410, 512, 630');
  assert.deepEqual(samples, [410, 512, 630]);
});

test('detectUnit treats implausibly small values as already-MiB', () => {
  assert.equal(Parser.detectUnit([410, 512, 630]), 'mib');
});

test('detectUnit treats large values as bytes', () => {
  assert.equal(Parser.detectUnit([187245312, 199512064]), 'bytes');
});

test('parseAndAnalyze converts bytes to MiB and computes average/peak', () => {
  const text = [
    'container_memory_working_set_bytes{pod="x"} 104857600',
    'container_memory_working_set_bytes{pod="x"} 209715200'
  ].join('\n');
  const result = Parser.parseAndAnalyze(text);
  assert.equal(result.unit, 'bytes');
  assert.equal(result.count, 2);
  assert.equal(result.averageMiB, 150);
  assert.equal(result.peakMiB, 200);
});

test('parseAndAnalyze passes already-MiB values through unchanged', () => {
  const result = Parser.parseAndAnalyze('410\n630');
  assert.equal(result.unit, 'mib');
  assert.equal(result.averageMiB, 520);
  assert.equal(result.peakMiB, 630);
});

test('parseAndAnalyze returns empty result for no samples', () => {
  const result = Parser.parseAndAnalyze('# just a comment\n');
  assert.equal(result.count, 0);
  assert.equal(result.averageMiB, null);
});

test('handles completely empty input without throwing', () => {
  assert.deepEqual(Parser.parseSamples(''), []);
  const result = Parser.parseAndAnalyze('');
  assert.equal(result.count, 0);
  assert.equal(result.averageMiB, null);
  assert.equal(result.peakMiB, null);
});

test('reads the value, not digits in the metric name (k8s_* OpenTelemetry metrics)', () => {
  assert.deepEqual(Parser.parseSamples('k8s_pod_memory_working_set_bytes{pod="api"} 419430400'), [419430400]);
});

test('parses label values containing braces and escaped quotes', () => {
  const line = 'container_memory_working_set_bytes{path="/a}b",note="say \\"hi\\""} 419430400';
  assert.deepEqual(Parser.parseSamples(line), [419430400]);
});

test('ignores OpenMetrics exemplars after the value', () => {
  const line = 'container_memory_working_set_bytes{pod="x"} 419430400 1727260000 # {trace_id="abc"} 1 1727260000';
  assert.deepEqual(Parser.parseSamples(line), [419430400]);
});

test('drops @timestamps from the Prometheus UI range-query table', () => {
  const text = [
    'container_memory_working_set_bytes{container="api",pod="api-7c9"}',
    '419430400 @1727260000.123',
    '429916160 @1727260015.123'
  ].join('\n');
  assert.deepEqual(Parser.parseSamples(text), [419430400, 429916160]);
});

test('drops @timestamps when range values sit on the series line', () => {
  const line = 'container_memory_working_set_bytes{pod="x"} 419430400 @1727260000.123 429916160 @1727260015.123';
  assert.deepEqual(Parser.parseSamples(line), [419430400, 429916160]);
});

test('parses Prometheus HTTP API range-query JSON', () => {
  const json = JSON.stringify({
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [{ metric: { container: 'api' }, values: [[1727260000.123, '419430400'], [1727260015.123, '429916160']] }]
    }
  });
  assert.deepEqual(Parser.parseSamples(json), [419430400, 429916160]);
});

test('parses Prometheus HTTP API instant-query JSON', () => {
  const json = JSON.stringify({
    status: 'success',
    data: { resultType: 'vector', result: [{ metric: {}, value: [1727260000.123, '419430400'] }] }
  });
  assert.deepEqual(Parser.parseSamples(json), [419430400]);
});

test('parses [timestamp, "value"] pairs copied out of the API JSON', () => {
  const text = '[1727260000.123, "419430400"],\n[1727260015.123, "429916160"]';
  assert.deepEqual(Parser.parseSamples(text), [419430400, 429916160]);
});

test('parses a Grafana CSV export with a date column', () => {
  const text = 'Time,Value\n2026-09-25 10:00:00,419430400\n2026-09-25 10:01:00,429916160';
  assert.deepEqual(Parser.parseSamples(text), [419430400, 429916160]);
});

test('parses a Grafana CSV export with an epoch-millisecond column', () => {
  const text = 'Time,Value\n1727260000000,419430400\n1727260060000,429916160';
  assert.deepEqual(Parser.parseSamples(text), [419430400, 429916160]);
});

test('keeps a genuine first column that is not increasing like a timestamp', () => {
  const text = '2147483648,3221225472\n2147000000,3221000000';
  assert.deepEqual(Parser.parseSamples(text), [2147483648, 3221225472, 2147000000, 3221000000]);
});

test('converts values with byte units (Grafana formatting, kubectl top)', () => {
  const result = Parser.parseAndAnalyze('pod-a  1 GiB\npod-b  512 MiB');
  assert.equal(result.unit, 'bytes');
  assert.deepEqual(result.valuesMiB, [1024, 512]);

  const top = Parser.parseAndAnalyze('NAME CPU(cores) MEMORY(bytes)\nweb 12m 412Mi\napi-7c9 30m 600Mi');
  assert.deepEqual(top.valuesMiB, [412, 600]);
});

test('skips pod-level and pause-container cAdvisor series', () => {
  const text = [
    'container_memory_working_set_bytes{container="api",pod="api-7c9"} 419430400',
    'container_memory_working_set_bytes{container="",pod="api-7c9"} 420478976',
    'container_memory_working_set_bytes{container="POD",pod="api-7c9"} 520192'
  ].join('\n');
  const result = Parser.parseAndAnalyze(text);
  assert.deepEqual(result.samples, [419430400]);
  assert.equal(result.skippedSeries, 2);
});

test('skips pause-container rows in the Prometheus UI range table', () => {
  const text = [
    'container_memory_working_set_bytes{container="POD",pod="api-7c9"}',
    '520192 @1727260000.123',
    'container_memory_working_set_bytes{container="api",pod="api-7c9"}',
    '419430400 @1727260000.123'
  ].join('\n');
  assert.deepEqual(Parser.parseSamples(text), [419430400]);
});

test('parses a CloudWatch Logs Insights CSV export of @maxMemoryUsed', () => {
  const text = '@timestamp,@maxMemoryUsed\n"2026-09-25 10:00:00.000","187245312"\n2026-09-25 10:00:04.000,201400000';
  assert.deepEqual(Parser.parseSamples(text), [187245312, 201400000]);
});

test('parses PromQL expression results, which have labels but no metric name', () => {
  const text = [
    '{instance="vm1:9100", job="node"}',
    '1073741824 @1727260000.123',
    '1181116006 @1727260015.123',
    '{instance="vm2:9100", job="node"} 996147200'
  ].join('\n');
  const result = Parser.parseAndAnalyze(text);
  assert.deepEqual(result.samples, [1073741824, 1181116006, 996147200]);
  assert.equal(result.ignoredLines, 0);
});

test('parses Redis INFO used_memory lines', () => {
  assert.deepEqual(Parser.parseSamples('used_memory:419430400\r\nused_memory:429916160'), [419430400, 429916160]);
});

test('still reads recording-rule metric names that contain colons', () => {
  assert.deepEqual(Parser.parseSamples('job:memory_bytes:sum{job="api"} 419430400'), [419430400]);
});

test('parses cAdvisor series for a systemd service cgroup', () => {
  const line = 'container_memory_working_set_bytes{id="/system.slice/myapp.service"} 187245312';
  assert.deepEqual(Parser.parseSamples(line), [187245312]);
});

test('parses systemctl show output, with or without the property name', () => {
  assert.deepEqual(Parser.parseSamples('MemoryCurrent=412345678\nMemoryCurrent=420000000'), [412345678, 420000000]);
  assert.deepEqual(Parser.parseSamples('412345678\n420000000'), [412345678, 420000000]);
});

test('computes the peak of very long sample lists without overflowing the stack', () => {
  const text = Array.from({ length: 300000 }, (_, i) => String(400000000 + i)).join('\n');
  const result = Parser.parseAndAnalyze(text);
  assert.equal(result.count, 300000);
  assert.equal(result.peakMiB, Parser.bytesToMiB(400000000 + 299999));
});

test('ignores NaN and negative values and reports them', () => {
  const result = Parser.parseAndAnalyze('a{pod="x"} NaN\nb{pod="y"} 419430400\n-5');
  assert.deepEqual(result.samples, [419430400]);
  assert.equal(result.ignoredLines, 2);
});

test('handles garbage input with no numbers at all', () => {
  const text = 'oops I pasted the wrong thing, this has no metrics in it whatsoever';
  assert.deepEqual(Parser.parseSamples(text), []);
  const result = Parser.parseAndAnalyze(text);
  assert.equal(result.count, 0);
});
