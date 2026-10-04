import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as azureFunctions from '../../public/js/formatters/azure-functions.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact Flex Consumption command for a known input', () => {
  const result = azureFunctions.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'az functionapp scale config set --resource-group <resource-group> --name <app> --instance-memory 2048');
  assert.equal(result.alternative.code, 'functionAppConfig.scaleAndConcurrency.instanceMemoryMB: 2048');
  assert.equal(result.plan, 'flex');
});

test('is peak-based: a low average does not shrink the instance', () => {
  assert.equal(azureFunctions.format(raw({ averageMiB: 50, peakMiB: 629.4 })).memory, 2048);
});

test('picks the smallest Flex Consumption size that fits', () => {
  assert.equal(azureFunctions.format(raw({ averageMiB: 10, peakMiB: 50, sensitivity: 'low' })).memory, 512);
  assert.equal(azureFunctions.format(raw({ peakMiB: 300 })).memory, 512);
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
