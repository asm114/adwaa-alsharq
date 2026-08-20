import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Commercial config requires customer-specific ownership metadata while preserving the product owner',async()=>{
  const source=await read('supabase-config.staging.js');
  assert.match(source,/ownerName:'عبدالعزيز الفوزان'/);
  assert.match(source,/authorizedCustomer:'CHANGE_ME_AUTHORIZED_CUSTOMER'/);
  assert.match(source,/clientId:'CHANGE_ME_CLIENT_ID'/);
  assert.match(source,/configuredValue\('ownership\.authorizedCustomer'/);
  assert.match(source,/configuredValue\('ownership\.clientId'/);
  assert.match(source,/ownerName!==['"]عبدالعزيز الفوزان['"]/);
  assert.match(source,/ownership,/);
});

test('Commercial runtime shows a restrained ownership notice without calling it a government license',async()=>{
  const source=await read('commercial-branding.js');
  assert.match(source,/config\.ownership/);
  assert.match(source,/commercialOwnershipNotice/);
  assert.match(source,/جميع الحقوق محفوظة/);
  assert.match(source,/هذه النسخة مصرح باستخدامها بواسطة/);
  assert.doesNotMatch(source,/مرخص حكوميًا|مسجل رسميًا|ترخيص حكومي/);
});

test('Proprietary notice separates product ownership, customer data, third-party rights, and government registration',async()=>{
  const source=await read('PROPRIETARY_NOTICE.md');
  assert.match(source,/© 2026 عبدالعزيز الفوزان/);
  assert.match(source,/بيانات العميل التشغيلية/);
  assert.match(source,/مكونات الطرف الثالث/);
  assert.match(source,/لا يدعي هذا الإشعار ملكية/);
  assert.match(source,/لا يعني أو يوحي بوجود تسجيل حكومي/);
});
