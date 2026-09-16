import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('ربط إدارة بوابة العملاء يستعيد جلسة البوابة من جلسة المدير الأساسية',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,/customer-portal-admin-session/);
  assert.match(compat,/supabaseClient\.auth\.getSession/);
  assert.match(compat,/Authorization':`Bearer \$\{primarySession\.access_token\}`/);
  assert.match(compat,/dedicatedClient\.auth\.setSession/);
  assert.match(compat,/ensurePortalAdminSession/);
});

test('نجاح جلسة البوابة يعيد تحميل بيانات إدارة البوابة',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,/adwaa-portal-admin-ready/);
  assert.match(compat,/loadProtectedPortalAdminData/);
});
