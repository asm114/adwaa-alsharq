import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('زر استلام باقي المبلغ يستخدم نفس سجل الدفعات والحفظ الأساسي',async()=>{
  const js=await read('remaining-payment-flow.js');
  assert.match(js,/استلام باقي المبلغ/);
  assert.match(js,/paymentAmount/);
  assert.match(js,/paymentType/);
  assert.match(js,/type\.value='final'/);
  assert.match(js,/paymentSaveButton/);
  assert.match(js,/requestSubmit/);
  assert.doesNotMatch(js,/booking\.payments\s*=/);
  assert.doesNotMatch(js,/booking\.paid\s*=/);
});

test('تنبيه باقي المبلغ يبدأ بعد الساعة 2 صباحًا في يوم الحجز فقط',async()=>{
  const js=await read('remaining-payment-flow.js');
  assert.match(js,/const REMINDER_HOUR=2/);
  assert.match(js,/booking\.date===today&&remaining\(booking\)>0/);
  assert.match(js,/هل تم استلام باقي المبلغ؟/);
  assert.match(js,/لا، ذكرني لاحقًا/);
  assert.match(js,/SNOOZE_MINUTES=30/);
  assert.doesNotMatch(js,/setInterval\s*\(/);
});

test('التنبيه لا يبقى بعد السداد أو الإلغاء',async()=>{
  const js=await read('remaining-payment-flow.js');
  assert.match(js,/!booking\|\|!active\(booking\)\|\|remaining\(booking\)<=0/);
  assert.match(js,/booking\.status!=='ملغي'/);
});

test('اللودر يحمل مسار باقي المبلغ بعد سجل الدفعات',async()=>{
  const loader=await read('portal-final-admin.js');
  const payments=loader.indexOf('booking-payment-history.js?v=20260813-2');
  const remaining=loader.indexOf('remaining-payment-flow.js?v=20260813-1');
  assert.ok(payments>=0);
  assert.ok(remaining>payments);
});
