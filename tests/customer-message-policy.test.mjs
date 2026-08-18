import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('A-F: تذكير المتبقي مستقل ومرتبط بالدخول ونافذتيه المعتمدتين',async()=>{
  const payment=await read('remaining-payment-flow.js');
  const operations=await read('operational-reminders-center.js');
  const index=await read('index.html');
  assert.match(payment,/booking\.status!=='تم الدخول'/);
  assert.match(payment,/FIRST_REMINDER_HOUR=22/);
  assert.match(payment,/SECOND_REMINDER_HOUR=0/);
  assert.match(payment,/today===entryDate&&now>=firstAt/);
  assert.match(payment,/today===secondDate&&now>=secondAt/);
  assert.match(payment,/filter\(row=>!row\.item\.promptedAt\)/);
  assert.match(payment,/remaining\(booking\)<=0/);
  assert.doesNotMatch(operations,/متبقي على العميل/);
  assert.match(index,/مرحبًا ضيفنا،\\nالمبلغ المتبقي للحجز/);
  assert.match(index,/type==='due'&&\(!canSendRemainingReminder\(saved\)\|\|saved\.manualOperations\?\.due\?\.sentAt\)/);
});

test('G-H: تنبيه الخروج في لوحة اليوم لا يسبق وقت الخروج',async()=>{
  const index=await read('index.html');
  assert.match(index,/function hasReachedBookingExitTime\(booking,now=new Date\(\)\)/);
  assert.match(index,/bookingExitDate\(b\)===today&&b\.status!=='تم الخروج'&&hasReachedBookingExitTime\(b,now\)/);
  assert.match(index,/const exits=active\.filter\(b=>bookingExitDate\(b\)===today&&b\.status!=='تم الخروج'&&hasReachedBookingExitTime\(b,now\)\)/);
});

test('I: حفظ الحجز يلفت إلى إرسال العقد يدويًا دون إرساله تلقائيًا',async()=>{
  const index=await read('index.html');
  const save=index.slice(index.indexOf('async function saveBooking'),index.indexOf('async function deleteBooking'));
  assert.match(index,/title:'إرسال العقد للعميل'/);
  assert.match(index,/action:'فتح مركز الإرسال'/);
  assert.match(index,/openContractSendCenter\('/);
  assert.doesNotMatch(save,/sendManualWhatsApp|window\.open\(/);
});

test('J: مركز الإرسال يعرض الرسائل المعتمدة فقط ويحافظ على فصل المستندات',async()=>{
  const index=await read('index.html');
  assert.match(index,/data-v92-action="contract-create"/);
  assert.match(index,/data-v92-action="contract-send"/);
  assert.match(index,/data-v92-action="invoice-create"/);
  assert.match(index,/data-v92-action="invoice-send"/);
  assert.match(index,/data-v92-action="due-send"/);
  assert.doesNotMatch(index,/data-v92-action="welcome-send"/);
  assert.doesNotMatch(index,/data-v92-action="reminder-send"/);
  assert.doesNotMatch(index,/data-v92-action="thanks-send"/);
  assert.match(index,/if\(\(type==='contract'\|\|type==='invoice'\)&&!saved\.manualOperations\?\.\[type\]\?\.createdAt\)/);
  assert.match(index,/هل أرسلت \$\{messageStatusLabel\(type\)\} للعميل بالفعل؟/);
});
