import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('ملف سياسة العربون صالح نحويًا ومحمل من المسار الرسمي',async()=>{
  const policy=await read('deposit-refund-policy.js');
  const loader=await read('subscription-booking-type.js');
  assert.doesNotThrow(()=>new vm.Script(policy));
  assert.match(loader,/deposit-refund-policy\.js\?v=20260914-1/);
});

test('إلغاء حجز بعربون يدعم غير مسترد وكامل وجزئي ويحفظ سجل الإرجاع',async()=>{
  const js=await read('deposit-refund-policy.js');
  assert.match(js,/retained:'العربون غير مسترد'/);
  assert.match(js,/refunded:'تم إرجاع العربون كاملًا'/);
  assert.match(js,/partial:'تم إرجاع جزء من العربون'/);
  assert.match(js,/booking\.depositCancellation=\{status:snapshot\.state\.status,depositAmount:snapshot\.amount,refundAmount:/);
  assert.match(js,/refundDate:/);
  assert.match(js,/refundMethod:/);
  assert.match(js,/note:/);
  assert.match(js,/recordedAt:new Date\(\)\.toISOString\(\)/);
});

test('لا يسمح بإرجاع أكثر من العربون والإرجاع الكامل يجب أن يساويه',async()=>{
  const js=await read('deposit-refund-policy.js');
  assert.match(js,/state\.refundAmount>amount/);
  assert.match(js,/Math\.abs\(state\.refundAmount-amount\)>0\.009/);
  assert.match(js,/مبلغ الإرجاع لا يمكن أن يتجاوز العربون/);
  assert.match(js,/في الإرجاع الكامل يجب أن يساوي مبلغ الإرجاع قيمة العربون/);
});

test('سجل الدفع الأصلي لا يُحذف أو يُنقص عند تسجيل حالة الإرجاع',async()=>{
  const js=await read('deposit-refund-policy.js');
  assert.doesNotMatch(js,/booking\.paid\s*=/);
  assert.doesNotMatch(js,/payments\.splice/);
  assert.doesNotMatch(js,/booking\.payments\s*=/);
  assert.match(js,/depositCancellation/);
});

test('سياسة عدم استرداد العربون تضاف لرسالة التأكيد فقط عند وجود مبلغ مدفوع',async()=>{
  const js=await read('booking-welcome-confirmation.js');
  assert.match(js,/DEPOSIT_POLICY_TEXT='سياسة العربون: العربون المدفوع غير مسترد في حال إلغاء الحجز من قبل العميل\. وفي حال تعذر تنفيذ الحجز من جهة المنتجع يُعاد العربون كاملًا\.'/);
  assert.match(js,/const b=booking\|\|resolvedBooking\(\),times=bookingTimesSafe\(b\),hasDeposit=paidDepositAmount\(b\)>0/);
  assert.match(js,/if\(hasDeposit\)lines\.push\('',DEPOSIT_POLICY_TEXT\)/);
});

test('واجهة حالة العربون لا تظهر إلا للحجز الملغي الذي لديه عربون',async()=>{
  const js=await read('deposit-refund-policy.js');
  assert.match(js,/const cancelled=document\.getElementById\('bStatus'\)\?\.value==='ملغي'/);
  assert.match(js,/box\?\.classList\.toggle\('show',cancelled&&amount>0\)/);
});

test('التغيير لا يحتوي SQL أو schema أو كتابة Supabase مباشرة',async()=>{
  const js=await read('deposit-refund-policy.js');
  assert.doesNotMatch(js,/supabase\.from/i);
  assert.doesNotMatch(js,/create table/i);
  assert.doesNotMatch(js,/alter table/i);
  assert.doesNotMatch(js,/schema/i);
});
