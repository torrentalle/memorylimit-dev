import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as azureFunctions from '../../public/js/formatters/azure-functions.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact Flex Consumption command for a known input', () => {
  const result = azureFunctions.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'az functionapp scale config set --resource-group <resource-group> --name <app> --instance-memory 2048');
  assert.equal(result.alternative.code, 'functionAppConfig: {\n  scaleAndConcurrency: {\n    instanceMemoryMB: 2048\n  }\n}');
  assert.equal(result.plan, 'flex');
});

test('is peak-based: a low average does not shrink the instance', () => {
  assert.equal(azureFunctions.format(raw({ averageMiB: 50, peakMiB: 629.4 })).memory, 2048);
});

test('picks the smallest Flex Consumption size that fits, but never below Microsoft’s 2,048 MB default', () => {
  const small = azureFunctions.format(raw({ averageMiB: 10, peakMiB: 50, sensitivity: 'low' }));
  assert.equal(small.memory, 2048);
  assert.equal(small.explanationSteps[1].text, 'fits 512 MB, but Microsoft’s 2,048 MB default applies → 2048 MB, 1 core');
  assert.equal(azureFunctions.format(raw({ peakMiB: 300 })).memory, 2048);
  assert.equal(azureFunctions.format(raw({ averageMiB: 1500, peakMiB: 2000, workloadType: 'worker' })).memory, 4096);
});

test('moves to Elastic Premium above Flex Consumption’s largest instance', () => {
  const result = azureFunctions.format(raw({ averageMiB: 4000, peakMiB: 5000 }));
  assert.equal(result.plan, 'premium');
  assert.equal(result.sku, 'EP2');
  assert.equal(result.snippet.code, 'az functionapp plan update --resource-group <resource-group> --name <plan> --sku EP2');
  assert.equal(result.alternative, null);
  assert.ok(result.warnings.some((w) => w.code === 'azure-functions-flex-too-small'));
});

test('picks the smallest Premium SKU that fits; EP1 is never needed because Flex covers up to 4096 MB', () => {
  assert.equal(azureFunctions.format(raw({ averageMiB: 2500, peakMiB: 2800 })).plan, 'flex');
  assert.equal(azureFunctions.format(raw({ averageMiB: 3800, peakMiB: 4000 })).sku, 'EP2');
  assert.equal(azureFunctions.format(raw({ averageMiB: 9000, peakMiB: 10000 })).sku, 'EP3');
});

test('clamps to EP3 and warns when nothing fits', () => {
  const result = azureFunctions.format(raw({ averageMiB: 20000, peakMiB: 30000, workloadType: 'worker', sensitivity: 'high' }));
  assert.equal(result.sku, 'EP3');
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ['azure-functions-flex-too-small', 'azure-functions-premium-range-exceeded']
  );
});

test('every Flex size is a Flex size and every Premium size grows', () => {
  assert.deepEqual(azureFunctions.FLEX_SIZES_MB, [512, 2048, 4096]);
  const sizes = azureFunctions.PREMIUM_SKUS.map((tier) => tier.memoryMiB);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
});

test('notes that memory is shared by concurrent executions', () => {
  assert.match(azureFunctions.format(raw()).note, /concurrency/);
});

test('explains the derivation in two short steps with the real numbers', () => {
  assert.deepEqual(azureFunctions.format(raw({ averageMiB: 410, peakMiB: 630 })).explanationSteps, [
    { label: 'Memory', text: '630 MiB peak + 30% = 819 MiB' },
    { label: 'Instance size', text: 'the smallest Flex Consumption size that fits → 2048 MB, 1 core' }
  ]);
  assert.match(azureFunctions.format(raw({ averageMiB: 4000, peakMiB: 5000 })).explanationSteps[1].text, /→ EP2 \(7168 MiB, 2 cores\)$/);
});

test('shows the CPU cores that come with the Flex size', () => {
  const result = azureFunctions.format(raw({ averageMiB: 1500, peakMiB: 2000, workloadType: 'worker' }));
  assert.equal(result.cores, 2);
  assert.ok(result.figures.some((f) => f.text === '2 cores'));
});

test('the Flex note explains the 2,048 MB default and when 512 MB is enough, within three sentences', () => {
  const { note } = azureFunctions.format(raw());
  assert.match(note, /2,048 MB for most apps, so that is the floor/);
  assert.match(note, /512 MB, with 0\.25 cores/);
  assert.ok(note.split(/(?<=\.) /).length <= 3);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'azure-functions', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = example.split(' ');
    const result = azureFunctions.format(calculateRawSizing({ averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }));
    const expected = { size: result.plan === 'flex' ? `${result.memory} MB` : result.sku, cores: azureFunctions.coresText(result.cores) };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 1, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites Microsoft’s documentation', () => {
  for (const url of [
    'https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan',
    'https://learn.microsoft.com/en-us/azure/azure-functions/functions-premium-plan',
    'https://learn.microsoft.com/en-us/azure/azure-functions/functions-concurrency'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});

test('a 512 MB minimum lets a small app take the 512 MB instance; any other value is rejected', () => {
  const small = raw({ averageMiB: 200, peakMiB: 300 });
  assert.equal(azureFunctions.format(small).memory, 2048);
  const result = azureFunctions.format(small, { minInstanceMB: '512' });
  assert.equal(result.memory, 512);
  assert.match(result.note, /^The floor here is your 512 MB minimum/);
  const raised = azureFunctions.format(small, { minInstanceMB: 4096 });
  assert.equal(raised.memory, 4096);
  assert.match(raised.explanationSteps[1].text, /^fits 512 MB, but your 4096 MB minimum applies/);
  assert.throws(() => azureFunctions.format(small, { minInstanceMB: 1024 }), RangeError);
});
