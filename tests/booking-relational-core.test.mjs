import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const schema='supabase/migrations/20260916090000_booking_relational_core.sql';
const writes='supabase/migrations/20260916091000_booking_atomic_writes.sql';

test('schema keeps booking, payment, refund and audit records separate',async()=>{
  const sql=await read(schema);
  for(const table of ['bookings','booking_payments','booking_refunds','booking_status_history','booking_audit_log','booking_mutations','booking_sync_health','booking_migration_snapshots']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
  }
});

test('schema migration is additive and does not touch legacy app_state',async()=>{
  const sql=await read(schema);
  assert.doesNotMatch(sql,/\b(update|delete\s+from|insert\s+into|alter\s+table)\s+public\.app_state\b/i);
});

test('new tables use RLS and the same manager gate as current app_state',async()=>{
  const sql=await read(schema);
  assert.match(sql,/alter table public\.bookings enable row level security/i);
  assert.match(sql,/is_adwaa_booking_manager/);
  assert.match(sql,/to authenticated/);
});

test('booking writes are serialized, idempotent and version checked',async()=>{
  const sql=await read(writes);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/idempotency_key=p_idempotency_key/);
  assert.match(sql,/p_expected_version is not null/);
  assert.match(sql,/errcode='40001'/);
  assert.match(sql,/returning \* into v_saved/);
});

test('refunds cannot exceed the linked original payment',async()=>{
  const sql=await read(writes);
  assert.match(sql,/already_refunded\+p_amount>payment_amount/);
  assert.match(sql,/Refund exceeds original payment/);
});
