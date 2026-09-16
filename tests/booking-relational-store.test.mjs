import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('booking-relational-store.js',root),'utf8');

test('relational store has valid JavaScript syntax',()=>assert.doesNotThrow(()=>new vm.Script(source)));
test('save uses atomic RPC with version and idempotency',()=>{
  assert.match(source,/rpc\('save_booking_v2'/);
  assert.match(source,/p_expected_version:expectedVersion/);
  assert.match(source,/p_idempotency_key:idempotencyKey/);
});
test('temporary network failure is queued but never reported as success',()=>{
  assert.match(source,/return \{ok:false,queued:true,error\}/);
  assert.doesNotMatch(source,/return \{ok:true,queued:true/);
});
test('realtime and five minute health monitoring are present',()=>{
  assert.match(source,/postgres_changes/);
  assert.match(source,/5\*60\*1000/);
  assert.match(source,/booking_sync_health/);
});
test('payments and refunds use dedicated atomic RPCs',()=>{
  assert.match(source,/record_booking_payment_v2/);
  assert.match(source,/record_booking_refund_v2/);
});
