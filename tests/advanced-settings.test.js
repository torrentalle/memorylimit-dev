import test from 'node:test';
import assert from 'node:assert/strict';
import { readAdvancedNumber } from '../public/js/advanced-settings.js';

const input = (value, { min = '', max = '', unit } = {}) => ({ value, min, max, dataset: unit ? { unit } : {} });

test('an empty or unreadable field gives null, so the default applies', () => {
  assert.equal(readAdvancedNumber(input('')), null);
  assert.equal(readAdvancedNumber(input('abc')), null);
});

test('a value is kept within the field’s min and max', () => {
  assert.equal(readAdvancedNumber(input('5', { min: '1', max: '2' })), 2);
  assert.equal(readAdvancedNumber(input('0.5', { min: '1', max: '2' })), 1);
  assert.equal(readAdvancedNumber(input('1.4', { min: '1', max: '2' })), 1.4);
  assert.equal(readAdvancedNumber(input('-3')), -3);
});

test('a percentage arrives as a fraction', () => {
  assert.equal(readAdvancedNumber(input('15', { min: '0', max: '100', unit: 'percent' })), 0.15);
  assert.equal(readAdvancedNumber(input('900', { min: '0', max: '200', unit: 'percent' })), 2);
});
