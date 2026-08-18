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

test('تنبيه باقي المبلغ مرحلتان بعد دخول العميل فقط دون تكرار مزعج',async()=>{
  const js=await read('remaining-payment-flow.js');
  assert.match(js,/const FIRST_REMINDER_HOUR=22/);
  assert.match(js,/const SECOND_REMINDER_HOUR=0/);
  assert.match(js,/booking\.status!=='تم الدخول'/);
  assert.match(js,/today===entryDate&&now>=firstAt/);
  assert.match(js,/today===secondDate&&now>=secondAt/);
  assert.match(js,/reminderKey=\(booking,stage\)=>`ops:remaining_payment:\$\{booking\.id\}:\$\{stage\}`/);
  assert.match(js,/reminderStage:stage,promptedAt:''/);
  assert.match(js,/filter\(row=>!row\.item\.promptedAt\)/);
  assert.match(js,/هل تم استلام باقي المبلغ؟/);
  assert.match(js,/لا، ذكرني لاحقًا/);
  assert.doesNotMatch(js,/const REMINDER_HOUR=2;/);
  assert.doesNotMatch(js,/SNOOZE_MINUTES=30/);
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
  const remaining=loader.indexOf('remaining-payment-flow.js?v=20260818-2');
  assert.ok(payments>=0);
  assert.ok(remaining>payments);
});
