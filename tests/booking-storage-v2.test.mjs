import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const baseMigration='supabase/migrations/20260916060000_booking_storage_v2.sql';
const ledgerHardening='supabase/migrations/20260916070000_booking_storage_v2_payment_ledger_hardening.sql';

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
  assert.match(source,/call load\(\) before editing existing bookings/);
  assert.match(source,/Financial movements are append-only/);
});

test('adapter verifies the committed row after every v2 save',async()=>{
  const source=await read('booking-storage-v2.js');
  assert.match(source,/async function readCommitted\(id\)/);
  assert.match(source,/const committed=await readCommitted\(id\)/);
  assert.match(source,/Supabase booking revision verification failed/);
  assert.match(source,/Supabase booking read-back verification failed/);
});

test('migration preserves exact source snapshot before backfill',async()=>{
  const sql=await read(baseMigration);
  assert.match(sql,/booking_migration_snapshots/);
  assert.match(sql,/md5\(s\.data::text\)/);
  const snapshotIndex=sql.indexOf('insert into public.booking_migration_snapshots');
  const reservationsIndex=sql.indexOf('insert into public.reservations');
  assert.ok(snapshotIndex>=0&&reservationsIndex>snapshotIndex);
});

test('migration preserves full legacy booking and payment JSON',async()=>{
  const sql=await read(baseMigration);
  assert.match(sql,/legacy_payload jsonb/);
  assert.match(sql,/booking,\n  md5\(booking::text\)/);
  assert.match(sql,/p\.payment,\n  md5\(p\.payment::text\)/);
});

test('payment hardening is ordered after the base v2 migration',()=>{
  const baseStamp=Number(baseMigration.match(/migrations\/(\d+)_/)?.[1]);
  const hardeningStamp=Number(ledgerHardening.match(/migrations\/(\d+)_/)?.[1]);
  assert.ok(Number.isFinite(baseStamp)&&Number.isFinite(hardeningStamp));
  assert.ok(hardeningStamp>baseStamp);
});

test('migration protects concurrent booking edits with revisions',async()=>{
  const sql=await read(ledgerHardening);
  assert.match(sql,/p_expected_revision bigint/);
  assert.match(sql,/for update/);
  assert.match(sql,/booking_revision_conflict/);
  assert.match(sql,/revision=r\.revision\+1/);
});

test('final save function never deletes payment history',async()=>{
  const sql=await read(ledgerHardening);
  const fnIndex=sql.indexOf('create or replace function public.save_booking_v2');
  const fn=sql.slice(fnIndex);
  assert.ok(fnIndex>=0);
  assert.doesNotMatch(fn,/delete\s+from\s+public\.payments/i);
  assert.match(fn,/on conflict \(reservation_id, legacy_payment_id\) do nothing/);
});

test('existing payment movements are immutable during booking edits',async()=>{
  const sql=await read(ledgerHardening);
  assert.match(sql,/payment_history_is_immutable/);
  assert.match(sql,/p\.source_hash is distinct from md5\(incoming::text\)/);
  assert.match(sql,/payment_id_required/);
});

test('final payment RLS allows manager read and append but no update or delete policy',async()=>{
  const sql=await read(ledgerHardening);
  assert.match(sql,/create policy "manager payments v2 select"/);
  assert.match(sql,/create policy "manager payments v2 insert"/);
  assert.doesNotMatch(sql,/for\s+update\s+to authenticated/i);
  assert.doesNotMatch(sql,/for\s+delete\s+to authenticated/i);
});

test('v2 reservation access remains restricted to manager account',async()=>{
  const sql=await read(baseMigration);
  assert.match(sql,/drop policy if exists "manager reservations"/);
  assert.match(sql,/asm114@hotmail\.com/);
});
