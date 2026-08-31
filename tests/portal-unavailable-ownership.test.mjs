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

test('المزامن المستقر يكتب ويحذف booking فقط ويعامل manual وlegacy كتعارض غير قابل للامتلاك',async()=>{
  const stable=await read('portal-booking-sync-stable.js');
  assert.match(stable,/source_type:SOURCE_BOOKING,booking_id:owner/);
  assert.match(stable,/\.delete\(\)\.eq\('id',id\)\.eq\('source_type',SOURCE_BOOKING\)/);
  assert.match(stable,/conflictingPeriodForDate\(periods,booking\.id,date\)/);
  assert.doesNotMatch(stable,/SOURCE_LEGACY/);
  assert.doesNotMatch(stable,/source_type\s*:\s*['"]legacy['"]/i);
  assert.doesNotMatch(stable,/source_type\s*:\s*['"]manual['"]/i);
});

test('المسار الرسمي يعطل reconciler القديم قبل تحميل portal-admin-client في Staging',async()=>{
  const loader=await read('subscription-booking-type.js');
  const guardIndex=loader.indexOf('window.__adwaaPortalCalendarConsistencyInstalled=true');
  const clientIndex=loader.indexOf("script.src='portal-admin-client.js?v=20260819-3'");
  assert.ok(guardIndex>=0);
  assert.ok(clientIndex>guardIndex);
});
