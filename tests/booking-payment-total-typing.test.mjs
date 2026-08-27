import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../booking-payment-history.js',import.meta.url),'utf8');

test('typing the booking total does not clamp or rewrite the deposit mid-entry',()=>{
  assert.match(source,/getElementById\('bTotal'\)\?\.addEventListener\('input',\(\)=>renderPayments\(\)\)/);
  assert.doesNotMatch(source,/getElementById\('bTotal'\)\?\.addEventListener\('input',[^\n]*syncDepositFromControls/);
});

test('deposit validation still runs after total entry is committed and before save',()=>{
  assert.match(source,/getElementById\('bTotal'\)\?\.addEventListener\('change',\(\)=>syncDepositFromControls\(\{render:true\}\)\)/);
  assert.match(source,/function normalizedDraftPayments\(\)\{syncDepositFromControls\(\);/);
});
