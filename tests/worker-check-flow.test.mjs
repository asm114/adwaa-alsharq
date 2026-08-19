import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('واجهة العامل لا تطلب كتابة وتقتصر على الصور والصوت والاختيارات البصرية',async()=>{
  const [html,js]=await Promise.all([read('worker-check.html'),read('worker-check-public.js')]);
  assert.doesNotMatch(html,/<textarea\b/i);
  assert.doesNotMatch(html,/type=["']text["']/i);
  assert.match(html,/type="file" accept="image\/\*"/);
  assert.match(html,/ابدأ التسجيل الصوتي/);
  assert.match(html,/أوساخ زائدة/);
  assert.match(html,/ضرر أثاث/);
  assert.match(js,/MediaRecorder/);
  assert.match(js,/MAX_RECORD_SECONDS=60/);
  assert.match(js,/MAX_PHOTOS=6/);
  assert.match(js,/finalize_customer_portal_worker_check/);
  assert.match(js,/customer-portal-worker-checks/);
});

test('تشييك العامل مرتبط بالحجز وهوية المنشأة ديناميكية دون اسم عامل ثابت',async()=>{
  const admin=await read('worker-check-admin.js');
  const html=await read('worker-check.html');
  assert.match(admin,/propertyName/);
  assert.match(admin,/propertyType/);
  assert.match(admin,/هوية المنشأة/);
  assert.match(admin,/create_customer_portal_worker_check/);
  assert.match(admin,/worker-check\.html/);
  assert.match(admin,/bookingId/);
  assert.match(admin,/window\.ensureCleaningTaskForBooking=noTask/);
  assert.match(admin,/text\.includes\('بوابة جميل'\)/);
  assert.match(admin,/sendCleaningTaskToJameel=.*shareWorkerCheck/);
  assert.doesNotMatch(html,/جميل/);
});

test('بعد خروج العميل لا تُنشأ مهمة تنظيف ولا يبقى تنبيه تنظيف تشغيلي',async()=>{
  const reminders=await read('operational-reminders-center.js');
  assert.doesNotMatch(reminders,/ensureCleaningTaskForBooking/);
  assert.doesNotMatch(reminders,/addReminder\('cleaning'/);
  assert.doesNotMatch(reminders,/مهمة تنظيف/);
  assert.match(reminders,/worker-check-admin\.js\?v=20260819-1/);
  assert.match(reminders,/if\(item\.operationalType==='cleaning'\)resolveReminder\(item\)/);
});

test('خلفية تشييك العامل تحمي الجدول وتسمح للعامل فقط برابط رمزي ورفع محدود',async()=>{
  const sql=await read('supabase/migrations/20260819054500_customer_portal_worker_checks.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_worker_checks/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.customer_portal_worker_checks from public, anon, authenticated/);
  assert.match(sql,/public\.is_resort_admin\(\)/);
  assert.match(sql,/get_customer_portal_worker_check/);
  assert.match(sql,/finalize_customer_portal_worker_check/);
  assert.match(sql,/private\.can_upload_customer_portal_worker_check/);
  assert.match(sql,/customer-portal-worker-checks/);
  assert.match(sql,/false,\s*8388608/);
  assert.match(sql,/cardinality\(coalesce\(p_photo_paths,'\{\}'\)\) < 1/);
  assert.match(sql,/cardinality\(coalesce\(p_photo_paths,'\{\}'\)\) > 6/);
  assert.match(sql,/alter publication supabase_realtime add table public\.customer_portal_worker_checks/);
});
