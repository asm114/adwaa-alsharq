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

test('production config owns booking submit and verifies Supabase before closing',async()=>{
  const config=await read('supabase-config.staging.js');
  assert.match(config,/BOOKING_SAVE_VERSION='20260916-3'/);
  assert.match(config,/document\.addEventListener\('submit'/);
  assert.match(config,/event\.target\?\.id!=='bookingForm'/);
  assert.match(config,/event\.stopImmediatePropagation\(\)/);
  assert.match(config,/writeStateAndVerifyBooking/);
  assert.match(config,/\.from\('app_state'\)/);
  assert.match(config,/\.update\(payload\)/);
  assert.match(config,/\.select\('data,updated_at'\)/);
  assert.match(config,/closeModal\('bookingModal'\)/);
  assert.ok(!config.includes('booking-save-direct-production.js?v=20260916-2'));
  assert.ok(!config.includes('booking-persist-update-path.js?v=20260916-2'));
  assert.match(config,/booking-save-stability\.js\?v=\$\{BOOKING_SAVE_VERSION\}/);
});
