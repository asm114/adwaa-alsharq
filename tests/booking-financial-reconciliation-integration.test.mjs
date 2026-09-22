import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('production app loads guarded booking reconciliation and persists its marker',async()=>{
  const html=await read('index.html');
  const account=await read('resort-account-core.js');
  assert.match(html,/booking-financial-reconciliation\.js\?v=20260922-1/);
  assert.match(html,/resort-account-core\.js\?v=20260922-2/);
  assert.match(account,/bookingReconciliationVersion/);
  assert.match(account,/bookingReconciliationIssues/);
});

test('reconciliation module contains only documented target booking codes',async()=>{
  const js=await read('booking-financial-reconciliation.js');
  const expected=['AD-0010','AD-0019','AD-0026','AD-0027','AD-0028','AD-0032','AD-0072','AD-0074','AD-0075','AD-0076','AD-0077'];
  for(const code of expected)assert.ok(js.includes(code),code);
  assert.match(js,/payments_changed/);
  assert.match(js,/expected_payment_missing/);
  assert.match(js,/postponed_state_changed/);
});
