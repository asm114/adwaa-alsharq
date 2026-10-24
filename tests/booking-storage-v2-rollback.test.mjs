import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const rollback='scripts/booking-v2-rollback-reconcile.sql';

test('rollback is manual, transactional, and snapshots app_state before reconciliation',async()=>{
  const sql=await read(rollback);
  assert.match(sql,/MANUAL EMERGENCY ROLLBACK ONLY/);
  assert.match(sql,/begin;/i);
  assert.match(sql,/for update;/i);
  assert.match(sql,/insert into public\.booking_migration_snapshots/i);
  assert.match(sql,/commit;/i);
});

test('rollback refuses payment or paid-total mismatches instead of guessing',async()=>{
  const sql=await read(rollback);
  assert.match(sql,/rollback_payment_count_mismatch/);
  assert.match(sql,/rollback_payment_payload_mismatch/);
  assert.match(sql,/rollback_payment_ledger_not_in_payload/);
  assert.match(sql,/rollback_paid_total_mismatch/);
  assert.match(sql,/p\.source_hash is distinct from md5\(movement::text\)/);
});

test('rollback rebuilds only app_state bookings from active v2 payloads',async()=>{
  const sql=await read(rollback);
  assert.match(sql,/jsonb_agg\(r\.legacy_payload order by r\.reservation_number\)/);
  assert.match(sql,/r\.deleted_at is null/);
  assert.match(sql,/data=jsonb_set\(s\.data,'\{bookings\}',authoritative\.bookings,true\)/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.(?:reservations|payments)/i);
  assert.doesNotMatch(sql,/drop\s+table/i);
});

test('rollback verifies final active booking count before commit and keeps v2 intact',async()=>{
  const sql=await read(rollback);
  assert.match(sql,/rollback_final_booking_count_mismatch/);
  assert.match(sql,/active_v2_bookings/);
  assert.match(sql,/active_payment_rows/);
  assert.match(sql,/active_payment_total/);
  assert.match(sql,/app_state_hash/);
});
