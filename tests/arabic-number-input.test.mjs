import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require=createRequire(import.meta.url);
const numbers=require('../arabic-number-input.js');

test('Arabic and Persian digits normalize without switching keyboard language',()=>{
  assert.equal(numbers.normalizeNumericText('١٢٣٤'),'1234');
  assert.equal(numbers.normalizeNumericText('١٬٢٣٤٫٥٠'),'1234.50');
  assert.equal(numbers.normalizeNumericText('۱۲۳۴٫۵'),'1234.5');
  assert.equal(numbers.normalizeNumericText('1,250.75'),'1250.75');
  assert.equal(numbers.normalizeNumericText('-١٢٫٥'),'-12.5');
});

test('normalized Arabic values parse as real numbers',()=>{
  assert.equal(numbers.parseNumber('٥٠٠'),500);
  assert.equal(numbers.parseNumber('١٬٨٥٧'),1857);
  assert.equal(numbers.parseNumber('٢٦٣٫٧٥'),263.75);
});
