import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('booking storage v2 adapter loads without syntax errors',async()=>{
  const source=await read('booking-storage-v2.js');
  assert.doesNotThrow(()=>new vm.Script(source));
});

test('adapter is non-invasive until explicitly called',async()=>{
  const source=await read('booking-storage-v2.js');
  assert.doesNotMatch(source,/window\.persist\s*=/);
  assert.doesNotMatch(source,/window\.saveBooking\s*=/);
  assert.match(source,/window\.__adwaaBookingStorageV2=\{/);
});

test('adapter uses revision checked RPC for writes',async()=>{
  const source=await read('booking-storage-v2.js');
  assert.match(source,/rpc\('save_booking_v2'/);
  assert.match(source,/p_expected_revision:expected/);
  assert.match(source,/revisions\.set\(id,nextRevision\)/);
});

test('migration preserves exact source snapshot before backfill',async()=>{
  const sql=await read('supabase/migrations/20260916060000_booking_storage_v2.sql');
  assert.match(sql,/booking_migration_snapshots/);
  assert.match(sql,/md5\(s\.data::text\)/);
  const snapshotIndex=sql.indexOf('insert into public.booking_migration_snapshots');
  const reservationsIndex=sql.indexOf('insert into public.reservations');
  assert.ok(snapshotIndex>=0&&reservationsIndex>snapshotIndex);
});

test('migration preserves full legacy booking and payment JSON',async()=>{
  const sql=await read('supabase/migrations/20260916060000_booking_storage_v2.sql');
  assert.match(sql,/legacy_payload jsonb/);
  assert.match(sql,/booking,\n  md5\(booking::text\)/);
  assert.match(sql,/p\.payment,\n  md5\(p\.payment::text\)/);
});

test('migration protects concurrent booking edits with revisions',async()=>{
  const sql=await read('supabase/migrations/20260916060000_booking_storage_v2.sql');
  assert.match(sql,/p_expected_revision bigint/);
  assert.match(sql,/for update/);
  assert.match(sql,/booking_revision_conflict/);
  assert.match(sql,/revision=r\.revision\+1/);
});

test('migration replaces payment set atomically inside booking save function',async()=>{
  const sql=await read('supabase/migrations/20260916060000_booking_storage_v2.sql');
  const fnIndex=sql.indexOf('create or replace function public.save_booking_v2');
  const deleteIndex=sql.indexOf('delete from public.payments p where p.reservation_id=v_reservation_id;',fnIndex);
  const insertIndex=sql.indexOf('insert into public.payments',deleteIndex);
  assert.ok(fnIndex>=0&&deleteIndex>fnIndex&&insertIndex>deleteIndex);
});

test('v2 reservation and payment RLS is restricted to manager account',async()=>{
  const sql=await read('supabase/migrations/20260916060000_booking_storage_v2.sql');
  assert.match(sql,/drop policy if exists "manager reservations"/);
  assert.match(sql,/drop policy if exists "manager payments"/);
  assert.match(sql,/asm114@hotmail\.com/);
});
