import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('المشروع يحتوي بوابة عملاء عامة مستقلة',async()=>{
  const html=await read('index.html');
  const js=await read('portal.js');
  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.match(html,/portal\.css/);
  assert.match(html,/portal\.js/);
  assert.match(html,/id="portalGallery"/);
  assert.match(html,/id="clientCalendar"/);
  assert.match(html,/id="clientContact"/);
  assert.match(js,/customer_portal_images/);
  assert.match(js,/customer_portal_unavailable_periods/);
  assert.match(js,/customer_portal_pricing/);
  assert.match(js,/customer_portal_seasons/);
  assert.match(js,/customer_portal_contact/);
  assert.doesNotMatch(html+js,/app_state|resort_bookings|customerProfile|payments|commission|expenses/i);
});

test('صفحة الإدارة مستقلة ولا تحمل نظام الحجوزات الأساسي',async()=>{
  const html=await read('admin/index.html');
  assert.match(html,/إدارة بوابة العملاء/);
  assert.match(html,/portal-admin\.js/);
  assert.match(html,/portal-final-admin\.js/);
  assert.match(html,/signInWithPassword/);
  assert.match(html,/window\.supabaseClient/);
  assert.doesNotMatch(html,/إدارة الحجوزات|سجل العملاء|المصاريف|app_state|resort_bookings/i);
});

test('صفحة الملاحظات عامة للإرسال فقط',async()=>{
  const html=await read('feedback.html');
  const js=await read('feedback.js');
  assert.match(html,/شاركنا ملاحظتك/);
  assert.match(js,/begin_customer_portal_feedback/);
  assert.match(js,/finalize_customer_portal_feedback/);
  assert.doesNotMatch(js,/select\('\*'\)|update\(|delete\(|service_role/i);
});

test('Migrations محصورة في جداول بوابة العملاء فقط',async()=>{
  const entries=await readdir(new URL('supabase/migrations/',root));
  assert.ok(entries.length>=10);
  for(const file of entries){
    const sql=await read(`supabase/migrations/${file}`);
    const executableSql=sql
      .replace(/--.*$/gm,'')
      .replace(/comment\s+on\s+[^;]+;/gi,'');
    if(file.includes('clean_legacy_resort_components')){
      assert.match(executableSql,/drop table if exists public\.app_state/i, file);
      assert.match(executableSql,/drop table if exists public\.resort_bookings/i, file);
      assert.doesNotMatch(executableSql,/select\s+.*\s+from\s+public\.(app_state|resort_bookings)/i, file);
    }else{
      assert.doesNotMatch(executableSql,/resort_bookings|app_state|customers|payments|expenses|commission|service_role/i, file);
    }
  }
  const merged=(await Promise.all(entries.map(file=>read(`supabase/migrations/${file}`)))).join('\n');
  for(const name of [
    'customer_portal_resort_info',
    'customer_portal_images',
    'customer_portal_unavailable_periods',
    'customer_portal_pricing',
    'customer_portal_seasons',
    'customer_portal_contact',
    'customer_portal_feedback',
    'customer_portal_visitor_counter',
    'customer_portal_activity_log',
    'customer_portal_admins'
  ]) assert.match(merged,new RegExp(name));
});

test('توثيق الفصل موجود وواضح',async()=>{
  const readme=await read('README.md');
  const arch=await read('ARCHITECTURE.md');
  assert.match(readme,/لا يقرأ `app_state`/);
  assert.match(readme,/لا يقرأ أو يكتب `resort_bookings`/);
  assert.match(arch,/يمكن تعطيل أو حذف بوابة العملاء دون تعطيل نظام الإدارة الأساسي/);
});
