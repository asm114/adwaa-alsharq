import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('حماية الحفظ تحمل بدون خطأ نحوي وتعرض حالات جاري/نجاح/فشل',async()=>{
  const source=await read('booking-save-stability.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(source,/جاري حفظ الحجز/);
  assert.match(source,/تم حفظ الحجز بنجاح/);
  assert.match(source,/لم يتم تأكيد حفظ الحجز/);
  assert.match(source,/bookingSaveBusy/);
});

test('الحفظ لا يعتبر ناجحًا إلا بعد قراءة الحجز من Supabase',async()=>{
  const source=await read('booking-save-stability.js');
  assert.match(source,/verifySavedBookingInSupabase/);
  assert.match(source,/from\('app_state'\)\.select\('data'\)/);
  assert.match(source,/لم يظهر الحجز/);
  assert.match(source,/updatedAt/);
  assert.match(source,/bookingModal.*classList\.add\('open'\)/s);
  assert.doesNotMatch(source,/remoteWriteConfirmed\(\)/);
});

test('التحقق يقارن العربون المطلوب مع المحفوظ فعليًا',async()=>{
  const source=await read('booking-save-stability.js');
  assert.match(source,/depositFromBooking/);
  assert.match(source,/تم رفض تأكيد العربون/);
  assert.match(source,/requested>0&&Math\.abs\(depositFromBooking\(remote\)-requested\)>0\.009/);
});

test('العربون لا يتم تصغيره بصمت أثناء الحفظ',async()=>{
  const source=await read('booking-save-stability.js');
  assert.match(source,/requestedDeposit\(\)/);
  assert.match(source,/requested>maxDeposit\+0\.009/);
  assert.match(source,/العربون المدخل/);
  assert.match(source,/لا يمكن تغييره تلقائيًا إلى مبلغ آخر/);
  assert.match(source,/payments\[index\]=\{\.\.\.payments\[index\],amount:requested\}/);
});

test('الملف محمل بعد سياسة إرجاع العربون',async()=>{
  const loader=await read('subscription-booking-type.js');
  const refundIndex=loader.indexOf('deposit-refund-policy.js');
  const stabilityIndex=loader.indexOf('booking-save-stability.js');
  assert.ok(refundIndex>=0,'سياسة العربون يجب أن تكون محملة');
  assert.ok(stabilityIndex>refundIndex,'حماية الحفظ يجب أن تحمل بعد سياسة العربون');
});
