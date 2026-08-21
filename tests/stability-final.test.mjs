import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('مزامنة بوابة العملاء تنتظر نجاح حفظ نظام الإدارة ولا تستخدم سجل تنظيف محلي',async()=>{
  const js=await read('portal-booking-sync-stable.js');
  assert.match(js,/coreWriteSucceeded/);
  assert.match(js,/__portalStableSyncWrapped/);
  assert.match(js,/save\.apply\(this,args\)/);
  assert.match(js,/remove\.apply\(this,args\)/);
  assert.match(js,/if\(!coreWriteSucceeded\(writeBefore\)\)/);
  assert.match(js,/async function saveMappingState\(\)/);
  assert.match(js,/const ok=coreWriteSucceeded\(before\)/);
  assert.match(js,/if\(stateChanged&&\!\(await saveMappingState\(\)\)\)/);
  assert.match(js,/بقيت الخريطة محفوظة على هذا الجهاز/);
  assert.doesNotMatch(js,/document\.addEventListener\('submit'/);
  assert.doesNotMatch(js,/document\.addEventListener\('click'/);
  assert.doesNotMatch(js,/setItem\(['"]adwaaPortalPendingDeletesV1/);
  assert.doesNotMatch(js,/getItem\(['"]adwaaPortalPendingDeletesV1/);
  assert.match(js,/pendingDeletes\.set\(beforeBooking\.id,mappingOf\(beforeBooking\)\)/);
  assert.match(js,/adwaa-portal-admin-ready/);
});

test('حفظ الحجز محمي من الضغط المكرر ويعرض حالة الحفظ',async()=>{
  const js=await read('portal-booking-sync-stable.js');
  assert.match(js,/let bookingSaveInFlight=false/);
  assert.match(js,/if\(bookingSaveInFlight\)/);
  assert.match(js,/جاري حفظ الحجز\.\.\./);
  assert.match(js,/button\.disabled=!!busy/);
  assert.match(js,/aria-busy/);
  assert.match(js,/showBookingToast\('تم حفظ الحجز ✓'/);
  assert.match(js,/reopenFailedBooking\(savedBooking\)/);
  assert.match(js,/دون إنشاء حجز مكرر/);
  assert.match(js,/syncPortalInBackground/);
});

test('فشل مزامنة الحجز لا يعرض نافذة منبثقة مربكة أثناء مسار الحفظ',async()=>{
  const js=await read('portal-booking-sync-stable.js');
  assert.match(js,/CORE_SYNC_ALERT='تعذر مزامنة آخر تعديل'/);
  assert.match(js,/withCapturedCoreSyncAlert/);
  assert.match(js,/if\(text\.includes\(CORE_SYNC_ALERT\)\)/);
  assert.match(js,/بوابة العملاء لم تتزامن بعد/);
});

test('جلسة مدير البوابة تعلن الجاهزية وتفحص توافق التواريخ مع ملكية مصدر الإغلاق',async()=>{
  const js=await read('portal-admin-client.js');
  assert.match(js,/const wasReady=window\.portalAdminAuthState\?\.ready===true/);
  assert.match(js,/if\(!wasReady\)\s*\{[\s\S]*?window\.dispatchEvent\(new CustomEvent\('adwaa-portal-admin-ready'\)\)/);
  assert.match(js,/verifyPortalAdmin\(\)\.catch/);
  assert.match(js,/verifyPortalCalendarConsistency/);
  assert.match(js,/verifyCalendarConsistency/);
  assert.match(js,/event\.target\?\.id==='bookingForm'/);
  assert.match(js,/deleteBookingBtn/);
  assert.match(js,/portalCalendarConsistency/);
  assert.match(js,/unexplainedSingleDays/);
  assert.match(js,/source_type,booking_id/);
  assert.match(js,/SOURCE_BOOKING='booking'/);
  assert.match(js,/SOURCE_LEGACY='legacy'/);
  assert.match(js,/adoptLegacyPeriod/);
  assert.match(js,/deleteOwnedPeriod/);
  assert.match(js,/\.eq\('source_type',SOURCE_BOOKING\)/);
  assert.doesNotMatch(js,/unexplained[\s\S]*\.delete\(/);
});

test('واجهة simplified-ui تحمل من نقطة واحدة فقط',async()=>{
  const finalAdmin=await read('portal-final-admin.js');
  const subscription=await read('subscription-booking-type.js');
  const loads=(finalAdmin.match(/simplified-ui\.js/g)||[]).length+(subscription.match(/simplified-ui\.js/g)||[]).length;
  assert.equal(loads,1);
  assert.doesNotMatch(subscription,/simplified-ui\.js/);
});

test('تقويم بوابة العملاء على الجوال يستخدم شبكة أسبوعية من 7 أعمدة دون اتصال Supabase إضافي',async()=>{
  const js=await read('resort/portal-today-highlight.js');
  assert.doesNotMatch(js,/createClient\s*\(/);
  assert.doesNotMatch(js,/AVAILABILITY_SUPABASE/);
  assert.doesNotMatch(js,/addEventListener\(['"]focus/);
  assert.doesNotMatch(js,/addEventListener\(['"]pageshow/);
  assert.match(js,/MutationObserver/);
  assert.match(js,/portal-today/);
  assert.match(js,/headerAvailabilityButton/);
  assert.match(js,/اختر التوفر/);
  assert.match(js,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(js,/\.weekdays\{display:grid!important/);
  assert.match(js,/floating-whatsapp-compact/);
});

test('Service Worker يستخدم كاش الإصدار الحالي ويحدث fallback عند نجاح فتح التطبيق',async()=>{
  const sw=await read('sw.js');
  assert.match(sw,/CACHE_NAMESPACE=`adwaa-alsharq:\$\{SCOPE_PATH\}:`/);
  assert.match(sw,/CACHE=`\$\{CACHE_NAMESPACE\}app-state-20260821`/);
  assert.match(sw,/supabase-config\.staging\.js/);
  assert.match(sw,/isAppShellRequest/);
  assert.match(sw,/cache\.put\(FALLBACK,response\.clone\(\)\)/);
  assert.doesNotMatch(sw,/adwaa-v9\.6-rc1/);
});

test('لودرات التدقيق النهائي تستخدم أرقام كاش محدثة وبترتيب عمولة الاشتراك الصحيح',async()=>{
  const finalAdmin=await read('portal-final-admin.js');
  const subscription=await read('subscription-booking-type.js');
  const portalHtml=await read('resort/index.html');
  assert.match(finalAdmin,/booking-payment-history\.js\?v=20260813-2/);
  assert.match(finalAdmin,/subscription-booking-type\.js\?v=20260813-4/);
  assert.match(finalAdmin,/portal-booking-sync-stable\.js\?v=20260813-4/);
  assert.match(subscription,/portal-admin-client\.js\?v=20260819-3/);
  assert.match(subscription,/subscription-commission-core\.js\?v=20260813-1/);
  assert.match(subscription,/subscription-revenue-integration\.js\?v=20260813-2/);
  assert.match(subscription,/commission-transfer-workflow\.js\?v=20260813-2/);
  assert.match(subscription,/professional-ui-stable\.js\?v=20260813-2/);
  assert.match(subscription,/daily-operations-policy\.js\?v=20260813-2/);
  assert.ok(subscription.indexOf('subscription-commission-core.js')<subscription.indexOf('commission-transfer-workflow.js'));
  assert.match(portalHtml,/portal-today-highlight\.js\?v=20260814-1/);
});
