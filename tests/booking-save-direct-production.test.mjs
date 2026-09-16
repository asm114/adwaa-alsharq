import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('direct booking save hotfix parses and writes app_state explicitly',async()=>{
  const source=await read('booking-save-direct-production.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(source,/\.from\('app_state'\)/);
  assert.match(source,/\.update\(payload\)/);
  assert.match(source,/\.eq\('id',rowId\)/);
  assert.match(source,/\.select\('id'\)/);
  assert.match(source,/directPersist\(\)/);
  assert.match(source,/verifyRemoteBooking/);
});

test('direct save surfaces real Supabase update errors',async()=>{
  const source=await read('booking-save-direct-production.js');
  assert.match(source,/فشل UPDATE المباشر في Supabase/);
  assert.match(source,/error\?\.code/);
  assert.match(source,/لم يتم حفظ الحجز في Supabase/);
});

test('production config loads direct save fix after existing save guards',async()=>{
  const config=await read('supabase-config.staging.js');
  const persist=config.indexOf('booking-persist-update-path.js?v=20260916-2');
  const stability=config.indexOf('booking-save-stability.js?v=20260916-2');
  const direct=config.indexOf('booking-save-direct-production.js?v=20260916-2');
  assert.ok(persist>=0);
  assert.ok(stability>persist);
  assert.ok(direct>stability);
});
