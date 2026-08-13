import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('مزامنة بوابة العملاء لا تعتمد على مؤقت حذف أو سجل تنظيف محلي',async()=>{
  const js=await read('portal-booking-sync-stable.js');
  assert.match(js,/queueMicrotask\(\(\)=>reconcileAll\(reason\)\)/);
  assert.doesNotMatch(js,/setTimeout\s*\(/);
  assert.doesNotMatch(js,/setItem\(['"]adwaaPortalPendingDeletesV1/);
  assert.doesNotMatch(js,/getItem\(['"]adwaaPortalPendingDeletesV1/);
  assert.match(js,/pendingDeletes\.set\(booking\.id,mappingOf\(booking\)\)/);
  assert.match(js,/if\(stillExists\)\{pendingDeletes\.delete\(bookingId\);continue\}/);
  assert.match(js,/adwaa-portal-admin-ready/);
});

test('جلسة مدير البوابة تعلن الجاهزية عند الانتقال للحالة الصحيحة فقط',async()=>{
  const js=await read('portal-admin-client.js');
  assert.match(js,/const wasReady=window\.portalAdminAuthState\?\.ready===true/);
  assert.match(js,/if\(!wasReady\)window\.dispatchEvent\(new CustomEvent\('adwaa-portal-admin-ready'\)\)/);
  assert.match(js,/verifyPortalAdmin\(\)\.catch/);
});

test('واجهة simplified-ui تحمل من نقطة واحدة فقط',async()=>{
  const finalAdmin=await read('portal-final-admin.js');
  const subscription=await read('subscription-booking-type.js');
  const loads=(finalAdmin.match(/simplified-ui\.js/g)||[]).length+(subscription.match(/simplified-ui\.js/g)||[]).length;
  assert.equal(loads,1);
  assert.doesNotMatch(subscription,/simplified-ui\.js/);
});

test('علامة اليوم لا تنشئ اتصال Supabase إضافيًا',async()=>{
  const js=await read('resort/portal-today-highlight.js');
  assert.doesNotMatch(js,/createClient\s*\(/);
  assert.doesNotMatch(js,/AVAILABILITY_SUPABASE/);
  assert.doesNotMatch(js,/addEventListener\(['"]focus/);
  assert.doesNotMatch(js,/addEventListener\(['"]pageshow/);
  assert.match(js,/MutationObserver/);
  assert.match(js,/portal-today/);
});

test('Service Worker يستخدم كاش الإصدار الحالي ويحدث fallback عند نجاح فتح التطبيق',async()=>{
  const sw=await read('sw.js');
  assert.match(sw,/adwaa-v9\.8-stability-20260813/);
  assert.match(sw,/isAppShellRequest/);
  assert.match(sw,/cache\.put\(FALLBACK,response\.clone\(\)\)/);
  assert.doesNotMatch(sw,/adwaa-v9\.6-rc1/);
});

test('لودرات الثبات تستخدم أرقام كاش محدثة',async()=>{
  const finalAdmin=await read('portal-final-admin.js');
  const subscription=await read('subscription-booking-type.js');
  const portalHtml=await read('resort/index.html');
  assert.match(finalAdmin,/subscription-booking-type\.js\?v=20260813-2/);
  assert.match(finalAdmin,/portal-booking-sync-stable\.js\?v=20260813-2/);
  assert.match(subscription,/portal-admin-client\.js\?v=20260813-1/);
  assert.match(portalHtml,/portal-today-highlight\.js\?v=20260813-2/);
});
