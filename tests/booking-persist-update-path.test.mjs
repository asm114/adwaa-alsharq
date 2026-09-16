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
  assert.match(source,/\.eq\('id',STATE_ROW_ID\)/);
  assert.match(source,/\.select\('id'\)/);
  assert.match(source,/if\(!updateResult\.data\?\.id\)/);
});

test('upsert يستخدم فقط كمسار احتياطي عند غياب السجل',async()=>{
  const source=await read('booking-persist-update-path.js');
  const updateIndex=source.indexOf('.update(payload)');
  const fallbackIndex=source.indexOf('.upsert({id:STATE_ROW_ID,...payload})');
  assert.ok(updateIndex>=0);
  assert.ok(fallbackIndex>updateIndex);
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
