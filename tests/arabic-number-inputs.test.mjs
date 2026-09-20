import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const require=createRequire(import.meta.url);
const core=require(fileURLToPath(new URL('../arabic-number-inputs.js',import.meta.url)));

test('Arabic and Persian digits normalize to ASCII numbers',()=>{
  assert.equal(core.normalizeDigits('١٢٥٠'),'1250');
  assert.equal(core.normalizeDigits('۱۲۵۰'),'1250');
  assert.equal(core.normalizeDigits('١٬٢٥٠٫٥٠'),'1250.50');
  assert.equal(core.normalizeDigits('−١٢٫٥'),'-12.5');
});

test('numeric text normalization keeps one decimal and strips thousands separators',()=>{
  assert.equal(core.normalizeNumericText('١٬٢٥٠٫٥٠',{allowDecimal:true,allowNegative:false}),'1250.50');
  assert.equal(core.normalizeNumericText('١٢٫٥٫٧',{allowDecimal:true,allowNegative:false}),'12.57');
  assert.equal(core.normalizeNumericText('٣٠',{allowDecimal:false,allowNegative:false}),'30');
});

test('main app loads Arabic numeric support before finance helpers',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const numeric=html.indexOf('arabic-number-inputs.js?v=20260920-1');
  const credit=html.indexOf('customer-credit-core.js?v=20260920-3');
  assert.ok(numeric>=0);
  assert.ok(credit>numeric);
});

test('numeric support converts number inputs to text so Arabic keyboard input is not rejected by the browser',async()=>{
  const js=await readFile(new URL('../arabic-number-inputs.js',import.meta.url),'utf8');
  assert.match(js,/input\.type='text'/);
  assert.match(js,/input\.inputMode=/);
  assert.match(js,/MutationObserver/);
  assert.match(js,/compositionend/);
  assert.match(js,/paste/);
});
