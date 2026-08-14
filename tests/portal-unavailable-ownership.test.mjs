import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Migration ملكية الإغلاقات يحفظ القديم كـ legacy ويفصل اليدوي عن الحجز',async()=>{
  const sql=await read('supabase/migrations/20260814114500_customer_portal_unavailable_ownership.sql');
  assert.match(sql,/add column if not exists source_type text/i);
  assert.match(sql,/add column if not exists booking_id text/i);
  assert.match(sql,/update public\.customer_portal_unavailable_periods\s+set source_type = 'legacy'\s+where source_type is null;/i);
  assert.match(sql,/alter column source_type set default 'manual'/i);
  assert.match(sql,/source_type in \('legacy','manual','booking'\)/i);
  assert.match(sql,/source_type = 'booking'[\s\S]*booking_id/i);
  assert.match(sql,/customer_portal_unavailable_periods_booking_idx/i);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.customer_portal_unavailable_periods/i);
  assert.doesNotMatch(sql,/drop table|truncate/i);
});

test('فحص التوافق يحذف فقط الإغلاقات المملوكة للحجز ولا يحذف legacy تلقائيًا',async()=>{
  const js=await read('portal-admin-client.js');
  assert.match(js,/source_type:SOURCE_BOOKING,booking_id:id/);
  assert.match(js,/period\.source_type!==SOURCE_BOOKING/);
  assert.match(js,/\.delete\(\)\.eq\('id',period\.id\)\.eq\('source_type',SOURCE_BOOKING\)/);
  assert.match(js,/period\.source_type===SOURCE_LEGACY&&exactDay\(period,date\)/);
  assert.match(js,/legacyUnownedSingleDays/);
  assert.doesNotMatch(js,/SOURCE_LEGACY[\s\S]*\.delete\(\)\.eq\('source_type',SOURCE_LEGACY\)/);
});
