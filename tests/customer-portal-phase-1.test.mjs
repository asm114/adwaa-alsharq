import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('لوحة المدير تعرض الحقول المتغيرة فقط',async()=>{
  const html=await read('index.html');
  for(const id of ['portalWhatsapp','portalInstagram','portalMaps','portalRequestsOpen','portalPauseMessage','portalDailyPrice','portalOvernightFee','portalOvernightEnabled','portalImageInput']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/معاينة بوابة العملاء/);
});

test('الصور تمر بإعادة ترميز وقيود النوع والحجم والتنظيف عند فشل السجل',async()=>{
  const js=await read('portal-admin.js');
  assert.match(js,/10\*1024\*1024/);
  assert.match(js,/image\/jpeg/);
  assert.match(js,/image\/png/);
  assert.match(js,/image\/webp/);
  assert.match(js,/HEIC غير مدعومة/);
  assert.match(js,/canvas\.toBlob/);
  assert.match(js,/storage\.from\(CUSTOMER_PORTAL_BUCKET\)\.remove\(\[path\]\)/);
});

test('البوابة تعيد التحقق قبل واتساب وتكوّن الرسالة المعتمدة',async()=>{
  const js=await read('resort/portal.js');
  assert.match(js,/await refreshAvailability\(\)/);
  assert.match(js,/get_resort_date_availability/);
  assert.match(js,/وقد ظهر لي أن التاريخ متاح وقت إرسال الطلب/);
  assert.match(js,/موافقة الإدارة واستلام العربون/);
  assert.match(js,/encodeURIComponent\(buildWhatsAppMessage\(\)\)/);
});

test('Migration يحصر الإدارة في is_resort_admin ويمنع الملفات غير المعتمدة',async()=>{
  const sql=await read('supabase/migrations/20260729090000_customer_portal_admin_phase_1.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_settings/i);
  assert.match(sql,/create table if not exists public\.customer_portal_images/i);
  assert.match(sql,/public\.is_resort_admin\(\)/);
  assert.match(sql,/allowed_mime_types[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/i);
  assert.match(sql,/file_size_limit[\s\S]*10485760/i);
  assert.match(sql,/security definer[\s\S]*get_resort_date_availability|create or replace function public\.get_resort_date_availability[\s\S]*security definer/i);
  assert.doesNotMatch(sql,/service_role/i);
});

test('النصوص الافتراضية والأسئلة الشائعة موجودة دون محرر نصوص',async()=>{
  const html=await read('resort/index.html');
  assert.match(html,/منتجع واسع في القاع البارد لجلساتكم ومناسباتكم الخاصة/);
  assert.match(html,/غرف النوم مخصصة لعملاء المبيت فقط/);
  assert.match(html,/لماذا توجد رسوم إضافية للمبيت؟/);
  assert.match(html,/شاهد الموقع والصور على Google Maps/);
});
