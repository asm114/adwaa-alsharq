import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('حفظ كلمة المرور لا يحجز انتقال الدخول على الجوال',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,/function makeCredentialSaveNonBlocking\(\)/);
  assert.match(compat,/Promise\.race\(\[task,new Promise\(resolve=>setTimeout\(resolve,60\)\)\]\)/);
  assert.match(compat,/window\.saveManagerCredentialPreference=wrapped/);
  assert.match(compat,/makeCredentialSaveNonBlocking\(\);/);
});

test('تحميل إصلاح الدخول يستخدم نسخة جديدة لتجاوز كاش المتصفح',async()=>{
  const loader=await read('subscription-booking-type.js');
  assert.match(loader,/portal-dedicated-backend-compat\.js\?v=20260819-2/);
});
