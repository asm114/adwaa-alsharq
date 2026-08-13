import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('إدارة بوابة العملاء تُوجَّه إلى مشروع البوابة فقط',async()=>{
  const js=await read('portal-admin-client.js');
  assert.match(js,/name\.startsWith\('customer_portal_'\)\?portalTableBuilder\(table\):coreFrom\(table\)/);
  assert.match(js,/name\.startsWith\('customer-portal-'\)\?portalAdminClient\.storage\.from\(bucket\):coreStorageFrom\(bucket\)/);
  assert.match(js,/portalAuditPayload/);
  assert.match(js,/\['updated_by','admin_id','created_by'\]/);
  assert.match(js,/queueMicrotask\(refreshPortalAdminViews\)/);
});

test('حفظ سجل الدفعات يتم داخل حفظ الحجز الأساسي دون persist ثانٍ',async()=>{
  const js=await read('booking-payment-history.js');
  assert.match(js,/__paymentHistorySaveBridge/);
  assert.match(js,/booking\.payments=payments/);
  assert.match(js,/booking\.paid=paymentSum\(payments\)/);
  assert.doesNotMatch(js,/window\.saveBooking=.*__paymentHistoryWrapped/);
  assert.doesNotMatch(js,/await persist\(\)/);
});

test('تحسينات الاشتراك لا تستخدم فحصًا دوريًا مستمرًا',async()=>{
  const js=await read('subscription-flexible-enhancements.js');
  assert.doesNotMatch(js,/setInterval\s*\(/);
  assert.match(js,/installEventDrivenRefresh/);
  assert.match(js,/adwaa-subscription-updated/);
});

test('مالية العميل للاشتراكات لا تراقب DOM بالكامل',async()=>{
  const js=await read('subscription-customer-finance.js');
  assert.doesNotMatch(js,/new MutationObserver/);
  assert.match(js,/wrapRenderer\('renderCustomers'\)/);
  assert.match(js,/adwaa-subscription-updated/);
});

test('العمولة العادية لا تستحق إلا بعد اكتمال المبلغ الإجمالي',async()=>{
  const policy=await read('daily-operations-policy.js');
  const workflow=await read('commission-transfer-workflow.js');
  assert.match(policy,/total>0&&paid>=total/);
  assert.match(policy,/status==='earned'&&!fullyPaidCommissionBooking\(booking\)\?'not_earned':status/);
  assert.match(workflow,/bookingStatus\(row\)==='earned'&&bookingFullyPaid\(row\)/);
  assert.match(workflow,/عمولة مستحقة بعد اكتمال السداد/);
});

test('عمولة الاشتراك تُحسب مرة واحدة على الباقة بعد اكتمال السداد',async()=>{
  const core=await read('subscription-commission-core.js');
  const workflow=await read('commission-transfer-workflow.js');
  const revenue=await read('subscription-revenue-integration.js');
  assert.match(core,/num\(sub\.paid\)>=num\(sub\.total\)/);
  assert.match(core,/days=visits\(sub\)/);
  assert.match(core,/status:'earned'/);
  assert.match(workflow,/subscriptionStatus\(row\)==='earned'&&subscriptionFullyPaid\(row\)/);
  assert.match(revenue,/subscriptionCommissionStatus/);
  assert.match(revenue,/totalCommissionByStatus/);
});

test('الأيام التي أنشأها الحجز تلقائيًا لا يمكن تعديلها يدويًا من إدارة البوابة',async()=>{
  const policy=await read('daily-operations-policy.js');
  assert.match(policy,/portalOwnedPeriodIds/);
  assert.match(policy,/portalUnavailablePeriodIds/);
  assert.match(policy,/تلقائي من حجز الإدارة/);
  assert.match(policy,/button\.disabled=true/);
  assert.match(policy,/wrapPortalAction\('deletePortalUnavailablePeriod'\)/);
  assert.match(policy,/wrapPortalUnavailableSave/);
});

test('تفاصيل المالية تعتمد حالة العمولة المركزية وتشمل عمولة الاشتراك',async()=>{
  const ui=await read('professional-ui-stable.js');
  assert.match(ui,/window\.commissionStatus\(row\)/);
  assert.match(ui,/window\.subscriptionCommissionStatus/);
  assert.match(ui,/subscriptionCommissionAmount/);
  assert.match(ui,/عمولة الاشتراك مستحقة مرة واحدة بعد اكتمال السداد/);
});

test('الترحيل اليدوي للبوابة مخفي ومعطل لصالح المزامنة التلقائية',async()=>{
  const policy=await read('daily-operations-policy.js');
  const loader=await read('subscription-booking-type.js');
  assert.match(policy,/transferOfficialSubscriptionToPortal=automaticPortalSync/);
  assert.match(policy,/transferSubscriptionDraftToPortal=automaticPortalSync/);
  assert.match(policy,/subscriptionControlTransfer=automaticPortalSync/);
  assert.doesNotMatch(loader,/subscription-transfer-date-preview-fix\.js/);
});

test('الحجز المكتمل خروجه لا يأخذ مظهر الإلغاء',async()=>{
  const policy=await read('daily-operations-policy.js');
  assert.match(policy,/status==='تم الخروج'\?'completed'/);
  assert.match(policy,/\.badge\.completed/);
});
