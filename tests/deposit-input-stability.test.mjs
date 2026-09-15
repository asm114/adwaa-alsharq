import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('حماية إدخال العربون تحمل بدون خطأ نحوي',async()=>{
  const source=await read('deposit-input-stability.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(source,/bookingDepositAmount/);
  assert.match(source,/bTotal/);
});

test('قيمة العربون التي كتبها المستخدم لا تضيع أثناء كتابة إجمالي الحجز رقمًا رقمًا',async()=>{
  const source=await read('deposit-input-stability.js');
  assert.match(source,/requestedDeposit=String\(event\.target\.value/);
  assert.match(source,/if\(String\(input\.value\?\?''\)!==requestedDeposit\)input\.value=requestedDeposit/);
  assert.match(source,/document\.addEventListener\('input',rememberDeposit,true\)/);
  assert.match(source,/document\.addEventListener\('input',restoreDuringTotalTyping,false\)/);
});

test('الحماية تحمل بعد حماية الحفظ الحالية',async()=>{
  const loader=await read('subscription-booking-type.js');
  const saveIndex=loader.indexOf('booking-save-stability.js');
  const inputIndex=loader.indexOf('deposit-input-stability.js');
  assert.ok(saveIndex>=0,'حماية الحفظ يجب أن تكون محملة');
  assert.ok(inputIndex>saveIndex,'حماية إدخال العربون يجب أن تحمل بعد حماية الحفظ');
});
