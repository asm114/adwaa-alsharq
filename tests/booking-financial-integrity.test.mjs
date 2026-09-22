import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('النواة المالية تحمل قبل وحدات الحجز والرصيد',async()=>{
  const html=await read('index.html');
  const core=await read('booking-financial-core.js');
  assert.ok(html.indexOf('booking-financial-core.js')<html.indexOf('customer-credit-core.js'));
  assert.doesNotThrow(()=>new vm.Script(core));
});

test('التطبيع العام لا يستطيع مسح سجل الدفعات خارج حفظ النموذج',async()=>{
  const payments=await read('booking-payment-history.js');
  const stability=await read('booking-save-stability.js');
  assert.match(payments,/if\(!window\.BookingFinancialCore\?\.isFormSaveActive\?\.\(\)\)return booking/);
  assert.match(stability,/if\(!window\.BookingFinancialCore\?\.isFormSaveActive\?\.\(\)\)return false/);
  assert.doesNotMatch(payments,/setTimeout\(loadBookingPayments,0\)/);
  assert.match(payments,/loadBookingPayments\(\);return result/);
});

test('الحفظ المباشر يجهز سجل الدفعات ويتحقق منه بعد الكتابة',async()=>{
  const config=await read('supabase-config.staging.js');
  assert.match(config,/BookingPaymentHistory\?\.prepareBookingForSave/);
  assert.match(config,/BookingFinancialCore\?\.withFormSaveScope/);
  assert.match(config,/التطبيع غيّر سجل الدفعات/);
  assert.match(config,/سجل الدفعات في Supabase لا يطابق/);
});

test('كل مخارج الحجوزات الرئيسية تستخدم المتبقي الموحد وتستثني الملغي والمؤجل',async()=>{
  const [index,groups,excel,reminders,professional]=await Promise.all([
    read('index.html'),read('booking-customer-groups.js'),read('bookings-excel-export.js'),read('remaining-payment-flow.js'),read('professional-ui-stable.js')
  ]);
  assert.match(index,/function getRemainingAmount\(booking\).*BookingFinancialCore\?\.remainingAmount/);
  assert.match(groups,/ملغي — لا يوجد مبلغ للتحصيل/);
  assert.match(excel,/if\(isCancelled\(b\)\|\|isPostponed\(b\)\)return 0/);
  assert.match(reminders,/BookingFinancialCore\?\.remainingAmount/);
  assert.match(professional,/const dueAmount=row=>window\.BookingFinancialCore\?\.remainingAmount/);
});

test('الحجز المؤجل له حالة مستقلة ويحفظ الدفعات ويخرج من التقويم والتحصيل',async()=>{
  const [index,postponement,portal,excel]=await Promise.all([
    read('index.html'),read('booking-postponement.js'),read('portal-booking-sync-stable.js'),read('bookings-excel-export.js')
  ]);
  assert.match(index,/<option>مؤجل<\/option>/);
  assert.match(postponement,/booking\.date=''/);
  assert.match(postponement,/postponedFromDate/);
  assert.match(postponement,/حدد موعدًا جديدًا قبل إعادة تفعيل الحجز المؤجل/);
  assert.match(portal,/\['ملغي','مؤجل'\]/);
  assert.match(excel,/مؤجل — لا يوجد تحصيل حتى تحديد موعد/);
});

test('إلغاء الحجز يحفظ كامل النقد المستلم كرصيد مرة واحدة',async()=>{
  const [index,credit]=await Promise.all([read('index.html'),read('customer-credit-core.js')]);
  assert.match(index,/core\.cancellationSettlement\(financialSource\)/);
  assert.match(credit,/function cancellationSettlement\(booking\)/);
  assert.match(credit,/addCreditOnce/);
});
