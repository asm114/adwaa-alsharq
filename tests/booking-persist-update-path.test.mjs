import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('مسار الحفظ المحسن يحمل بدون خطأ نحوي',async()=>{
  const source=await read('booking-persist-update-path.js');
  assert.doesNotThrow(()=>new vm.Script(source));
});

test('الحفظ يحدث سجل main الموجود بدل الاعتماد على upsert في كل مرة',async()=>{
  const source=await read('booking-persist-update-path.js');
  assert.match(source,/\.update\(payload\)/);
  assert.match(source,/\.eq\('id',rowId\)/);
  assert.match(source,/\.select\('id,updated_at'\)/);
  assert.match(source,/\.eq\('updated_at',base\)/);
});

test('missing records never fall back to unsafe upsert',async()=>{
  assert.doesNotMatch(await read('booking-persist-update-path.js'),/\.upsert\(/);
});

test('فشل Supabase يخرج كخطأ حقيقي كي لا يظهر الحفظ ناجحًا',async()=>{
  const source=await read('booking-persist-update-path.js');
  assert.match(source,/window\.__adwaaLastPersistResult=\{ok:false/);
  assert.match(source,/throw err/);
});

test('ملف الاستقرار يحمل مسار الحفظ الجديد',async()=>{
  const loader=await read('deposit-input-stability.js');
  assert.match(loader,/booking-persist-update-path\.js\?v=20260916-1/);
});
