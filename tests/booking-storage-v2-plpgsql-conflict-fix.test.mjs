import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const migration='supabase/migrations/20260916100000_booking_storage_v2_plpgsql_conflict_fix.sql';
const read=path=>readFile(new URL(path,root),'utf8');

test('final save RPC prefers table columns on PLpgSQL name conflicts',async()=>{
  const sql=await read(migration);
  assert.match(sql,/#variable_conflict use_column/);
  assert.match(sql,/returning saved\.id, saved\.revision into v_reservation_id, v_new_revision/);
  assert.match(sql,/on conflict \(reservation_id, legacy_payment_id\) do nothing/);
});

test('final save RPC retains core safety invariants',async()=>{
  const sql=await read(migration);
  assert.match(sql,/booking_revision_conflict/);
  assert.match(sql,/payment_history_is_immutable/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.payments/i);
});
