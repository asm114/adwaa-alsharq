import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const portalRef='ztqqdjryvecscidxxbfe';

test('بوابة العملاء العامة تبقى على قاعدة البوابة المخصصة',async()=>{
  const portal=await read('resort/portal.js');
  const bridge=await read('resort/supabase-runtime-bridge.js');
  assert.match(portal,new RegExp(`https://${portalRef}\\.supabase\\.co`));
  assert.match(bridge,new RegExp(portalRef));
  assert.doesNotMatch(bridge,/supabaseApi\.createClient\s*=|originalCreateClient/);
});

test('جسر بوابة العملاء لا يعيد توجيه createClient إلى Production',async()=>{
  const source=await read('resort/supabase-runtime-bridge.js');
  const original=()=>({ok:true});
  const context={window:{supabase:{createClient:original}}};
  vm.runInNewContext(source,context);
  assert.equal(context.window.supabase.createClient,original);
  assert.equal(context.window.__adwaaCustomerPortalBackendRef,portalRef);
});

test('لوحة الإدارة تحمل إصلاح ربط قاعدة بوابة العملاء بعد عميل البوابة',async()=>{
  const subscription=await read('subscription-booking-type.js');
  assert.match(subscription,/portal-admin-client\.js\?v=20260814-2[\s\S]*portal-dedicated-backend-compat\.js\?v=20260819-1/);
});

test('إصلاح الإدارة يستخدم قاعدة البوابة المخصصة ولا يغيّر core Supabase',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,new RegExp(`PORTAL_PROJECT_REF='${portalRef}'`));
  assert.match(compat,/window\.portalAdminClient=dedicatedClient/);
  assert.match(compat,/name\.startsWith\('customer_portal_'\)\?portalTableBuilder\(table\):currentFrom\(table\)/);
  assert.match(compat,/name\.startsWith\('customer-portal-'\)\?dedicatedClient\.storage\.from\(bucket\):currentStorageFrom\(bucket\)/);
  assert.doesNotMatch(compat,/window\.supabaseClient\s*=/);
});
