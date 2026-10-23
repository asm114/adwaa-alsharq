import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('retired direct hotfix cannot bypass shared revision checks',async()=>{
  const source=await read('booking-save-direct-production.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.doesNotMatch(source,/\.update\(|\.upsert\(|window\.persist=/);
});

test('production config owns booking submit and verifies Supabase before closing',async()=>{
  const config=await read('supabase-config.staging.js');
  assert.match(config,/BOOKING_SAVE_VERSION='20260922-1'/);
  assert.match(config,/document\.addEventListener\('submit'/);
  assert.match(config,/event\.target\?\.id!=='bookingForm'/);
  assert.match(config,/event\.stopImmediatePropagation\(\)/);
  assert.match(config,/writeStateAndVerifyBooking/);
  assert.match(config,/\.from\('app_state'\)/);
  assert.match(config,/const saved=await window\.persist\(\)/);
  assert.match(config,/\.select\('data,updated_at'\)/);
  assert.match(config,/closeModal\('bookingModal'\)/);
  assert.ok(!config.includes('booking-save-direct-production.js?v=20260916-2'));
  assert.ok(!config.includes('booking-persist-update-path.js?v=20260916-2'));
  assert.match(config,/booking-save-stability\.js\?v=\$\{BOOKING_SAVE_VERSION\}/);
});
