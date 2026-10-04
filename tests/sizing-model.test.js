// The /sizing-model/ page explains calculateRawSizing(). Its tables and worked
// example are checked against the real code here, so the page can't drift from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateRawSizing,
  SENSITIVITY_REQUEST_MARGIN,
  SENSITIVITY_LIMIT_MARGIN,
  WORKLOAD_REQUEST_ADJUSTMENT,
  WORKLOAD_LIMIT_ADJUSTMENT,
  ENVIRONMENT_MULTIPLIER
} from '../public/js/calculator.js';
import * as kubernetes from '../public/js/formatters/kubernetes.js';
import { PLATFORM_DEFINITIONS } from '../public/js/platforms.js';

const page = readFileSync(join(import.meta.dirname, '..', 'public', 'sizing-model', 'index.html'), 'utf8');

const percent = (fraction) => `${Number((fraction * 100).toFixed(2))}%`;
const mib = (value) => `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} MiB`;
const points = (fraction) => (fraction === 0 ? '0' : `${fraction > 0 ? '+' : '−'}${Math.round(Math.abs(fraction) * 100)}`);
const FORMAT = { requestMarginPct: percent, limitMarginPct: percent, requestMiB: mib, limitMiB: mib };

// Every element with data-example="avg peak workload sensitivity environment", and the data-check cells inside it.
function examples() {
  const found = [];
  for (const match of page.matchAll(/<(table|tr)[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = match[2].split(' ');
    const checks = [...match[3].matchAll(/data-check="(\w+)">([^<]+)</g)].map(([, key, text]) => ({ key, text }));
    found.push({ input: { averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }, checks });
  }
  return found;
}

test('the worked example and the profile table show what calculateRawSizing() returns', () => {
  const all = examples();
  assert.equal(all.length, 8, 'one worked example and seven profiles');
  for (const { input, checks } of all) {
    assert.equal(checks.length, 4, JSON.stringify(input));
    const raw = calculateRawSizing(input);
    for (const { key, text } of checks) assert.equal(text, FORMAT[key](raw[key]), `${JSON.stringify(input)} ${key}`);
  }
});

test('the worked example’s Kubernetes values are what the Kubernetes formatter gives', () => {
  const raw = calculateRawSizing({ averageMiB: 410, peakMiB: 630, workloadType: 'jvm', sensitivity: 'medium', environment: 'staging' });
  const { request, limit } = kubernetes.format(raw);
  assert.ok(page.includes(`a ${request}Mi request and a ${limit}Mi limit`), `${request}Mi / ${limit}Mi`);
});

test('the margin tables match calculator.js', () => {
  for (const level of ['low', 'medium', 'high']) {
    const row = `<th scope="row">${level[0].toUpperCase()}${level.slice(1)}</th><td>${percent(SENSITIVITY_REQUEST_MARGIN[level])}</td><td>${percent(SENSITIVITY_LIMIT_MARGIN[level])}</td>`;
    assert.ok(page.includes(row), row);
  }
  for (const [type, label] of [['jvm', 'JVM'], ['worker', 'Worker / batch'], ['cache', 'Cache']]) {
    const row = `<td>${label}</td><td>${points(WORKLOAD_REQUEST_ADJUSTMENT[type])}</td><td>${points(WORKLOAD_LIMIT_ADJUSTMENT[type])}</td>`;
    assert.ok(page.includes(row), row);
  }
  for (const type of ['api', 'node', 'python', 'generic']) {
    assert.equal(WORKLOAD_REQUEST_ADJUSTMENT[type], 0, type);
    assert.equal(WORKLOAD_LIMIT_ADJUSTMENT[type], 0, type);
  }
  for (const env of ['development', 'staging', 'production']) {
    const row = `<th scope="row">${env[0].toUpperCase()}${env.slice(1)}</th><td>${percent(ENVIRONMENT_MULTIPLIER[env])}</td>`;
    assert.ok(page.includes(row), row);
  }
});

test('the page marks the margins as assumptions, cites the Kubernetes docs and links every calculator', () => {
  assert.ok((page.match(/guide-tag--assumption/g) ?? []).length >= 6);
  assert.ok(page.includes('https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'));
  assert.match(page, /id="assumptions"/);
  assert.match(page, /id="references"/);
  for (const def of PLATFORM_DEFINITIONS) assert.ok(page.includes(`<a href="${def.path}">`), def.path);
});
