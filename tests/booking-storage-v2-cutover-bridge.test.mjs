import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const migration='supabase/migrations/20260916120000_booking_storage_v2_soft_delete_and_legacy_mirror.sql';

test('soft delete migration preserves financial history and stops deleted bookings blocking dates',async()=>{
  const sql=await read(migration);
  assert.match(sql,/add column if not exists deleted_at timestamptz/i);
  assert.match(sql,/delete_booking_v2/);
  assert.match(sql,/deleted_at is null and coalesce\(status, ''\) <> 'ملغي'/);
  assert.match(sql,/revoke delete on table public\.reservations from authenticated/i);
  const deleteFn=sql.slice(sql.indexOf('create or replace function public.delete_booking_v2'),sql.indexOf('create or replace function public.sync_booking_legacy_mirror_v2'));
  assert.doesNotMatch(deleteFn,/delete\s+from\s+public\.payments/i);
  assert.match(deleteFn,/revision=r\.revision\+1/);
  assert.match(deleteFn,/booking_revision_conflict/);
});

test('legacy mirror only replaces the bookings key from active v2 rows',async()=>{
  const sql=await read(migration);
  const mirror=sql.slice(sql.indexOf('create or replace function public.sync_booking_legacy_mirror_v2'));
  assert.match(mirror,/jsonb_set\(data, '\{bookings\}', v_bookings, true\)/);
  assert.match(mirror,/r\.deleted_at is null/);
  assert.match(mirror,/order by r\.reservation_number/);
  assert.doesNotMatch(mirror,/data\s*=\s*v_bookings/i);
});

test('adapter supports read-back verified soft delete and legacy mirror sync',async()=>{
  const source=await read('booking-storage-v2.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(source,/\.is\('deleted_at',null\)/);
  assert.match(source,/rpc\('delete_booking_v2'/);
  assert.match(source,/Supabase booking delete read-back verification failed/);
  assert.match(source,/rpc\('sync_booking_legacy_mirror_v2'\)/);
});

test('dual-write bridge is opt-in and intercepts all persist-based booking mutations centrally',async()=>{
  const source=await read('booking-storage-v2-dualwrite.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(source,/options\?\.enable!==true/);
  assert.match(source,/explicit_enable_required/);
  assert.match(source,/originalPersist=persist/);
  assert.match(source,/persist=function bookingV2DualWritePersist/);
  assert.match(source,/adapter\.save\(booking\)/);
  assert.match(source,/adapter\.remove\(id\)/);
  assert.match(source,/adapter\.syncLegacy\(\)/);
  assert.match(source,/Booking v2 preflight mismatch/);
});

test('dual-write bridge serializes persist calls and can be uninstalled for rollback',async()=>{
  const source=await read('booking-storage-v2-dualwrite.js');
  assert.match(source,/persistQueue\.then\(\(\)=>runPersist\(args\)\)/);
  assert.match(source,/persist=originalPersist/);
  assert.match(source,/uninstall/);
});
