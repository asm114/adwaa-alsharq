import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const migration='supabase/migrations/20260916090000_booking_storage_v2_save_function_fix.sql';

const read=path=>readFile(new URL(path,root),'utf8');

test('save RPC fix is ordered after date-overlap hardening',()=>{
  const fixStamp=Number(migration.match(/migrations\/(\d+)_/)?.[1]);
  assert.equal(fixStamp,20260916090000);
});

test('new booking INSERT RETURNING is explicitly qualified',async()=>{
  const sql=await read(migration);
  assert.match(sql,/insert into public\.reservations as saved/);
  assert.match(sql,/returning saved\.id, saved\.revision into v_reservation_id, v_new_revision/);
  assert.doesNotMatch(sql,/returning id, revision into v_reservation_id, v_new_revision/);
});

test('save RPC fix keeps revision and append-only payment protections',async()=>{
  const sql=await read(migration);
  assert.match(sql,/booking_revision_conflict/);
  assert.match(sql,/payment_history_is_immutable/);
  assert.match(sql,/on conflict \(reservation_id, legacy_payment_id\) do nothing/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.payments/i);
});
