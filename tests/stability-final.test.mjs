import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('مزامنة بوابة العملاء تنتظر نجاح حفظ نظام الإدارة ولا تستخدم سجل تنظيف محلي',async()=>{
  const js=await read('portal-booking-sync-stable.js');
  assert.match(js,/coreWriteSucceeded/);
  assert.match(js,/__portalStableSyncWrapped/);
  assert.match(js,/await save\.apply\(this,args\)/);
  assert.match(js,/await remove\.apply\(this,args\)/);
  assert.match(js,/if\(!coreWriteSucceeded\(writeBefore\)\)/);
  assert.match(js,/async function saveMappingState\(\)[\s\S]*?return coreWriteSucceeded\(before\)/);
  assert.match(js,/if\(stateChanged&&\!\(await saveMappingState\(\)\)\)/);
  assert.match(js,/بقيت الخريطة محفوظة على هذا الجهاز/);
  assert.doesNotMatch(js,/document\.addEventListener\('submit'/);
  assert.doesNotMatch(js,/document\.addEventListener\('click'/);
  assert.doesNotMatch(js,/setItem\(['"]adwaaPortalPendingDeletesV1/);
  assert.doesNotMatch(js,/getItem\(['"]adwaaPortalPendingDeletesV1/);
  assert.match(js,/pendingDeletes\.set\(beforeBooking\.id,mappingOf\(beforeBooking\)\)/);
  assert.match(js,/adwaa-portal-admin-ready/);
});

test('جلسة مدير البوابة تعلن الجاهزية عند الانتقال للحالة الصحيحة فقط',async()=>{
  const js=await read('portal-admin-client.js');
  assert.match(js,/const wasReady=window\.portalAdminAuthState\?\.ready===true/);
  assert.match(js,/if\(!wasReady\)\s*\{[\s\S]*?window\.dispatchEvent\(new CustomEvent\('adwaa-portal-admin-ready'\)\)/);
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

test('لودرات التدقيق النهائي تستخدم أرقام كاش محدثة وبترتيب عمولة الاشتراك الصحيح',async()=>{
  const finalAdmin=await read('portal-final-admin.js');
  const subscription=await read('subscription-booking-type.js');
  const portalHtml=await read('resort/index.html');
  assert.match(finalAdmin,/booking-payment-history\.js\?v=20260813-1/);
  assert.match(finalAdmin,/subscription-booking-type\.js\?v=20260813-4/);
  assert.match(finalAdmin,/portal-booking-sync-stable\.js\?v=20260813-3/);
  assert.match(subscription,/portal-admin-client\.js\?v=20260813-2/);
  assert.match(subscription,/subscription-commission-core\.js\?v=20260813-1/);
  assert.match(subscription,/subscription-revenue-integration\.js\?v=20260813-2/);
  assert.match(subscription,/commission-transfer-workflow\.js\?v=20260813-2/);
  assert.match(subscription,/professional-ui-stable\.js\?v=20260813-2/);
  assert.match(subscription,/daily-operations-policy\.js\?v=20260813-2/);
  assert.ok(subscription.indexOf('subscription-commission-core.js')<subscription.indexOf('commission-transfer-workflow.js'));
  assert.match(portalHtml,/portal-today-highlight\.js\?v=20260813-2/);
});
