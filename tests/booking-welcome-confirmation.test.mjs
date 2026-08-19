import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('رسالة الترحيب تعتمد صيغة ضيفنا الكريم وتأكيد الحجز بلا كلمة بنجاح',async()=>{
  const js=await read('booking-welcome-confirmation.js');
  assert.match(js,/حياك الله ضيفنا الكريم 🌷/);
  assert.match(js,/تم تأكيد حجزكم لدينا\./);
  assert.doesNotMatch(js,/تم تأكيد حجزكم لدينا بنجاح/);
  assert.match(js,/رقم الحجز:/);
  assert.match(js,/التاريخ:/);
  assert.match(js,/الدخول:/);
  assert.match(js,/الخروج:/);
});

test('مركز الإرسال يضيف زر الترحيب ويخفي الفاتورة من المسار اليومي',async()=>{
  const js=await read('booking-welcome-confirmation.js');
  assert.match(js,/welcome-confirmation-send/);
  assert.match(js,/ترحيب وتأكيد الحجز/);
  assert.match(js,/invoice-create/);
  assert.match(js,/card\.remove\(\)/);
  assert.match(js,/grid\.style\.gridTemplateColumns='1fr'/);
});

test('الرسالة تستخدم مسار واتساب اليدوي الحالي وتسجل حالة welcome',async()=>{
  const js=await read('booking-welcome-confirmation.js');
  assert.match(js,/sendManualWhatsApp\('welcome'\)/);
  assert.match(js,/manualOperations\?\.welcome\?\.sentAt/);
  assert.match(js,/manualMessages\?\.welcome/);
});

test('محمل تحسين المستندات يحمل تدفق الترحيب الجديد',async()=>{
  const js=await read('document-preview-controls.js');
  assert.match(js,/booking-welcome-confirmation\.js\?v=20260819-1/);
});
