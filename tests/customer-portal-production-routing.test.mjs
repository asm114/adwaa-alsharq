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

test('Production لا يحمل عميل البوابة القديم الذي يشارك جلسة الإدارة',async()=>{
  const subscription=await read('subscription-booking-type.js');
  assert.match(subscription,/runtimeEnvironment==='production'\)return;window\.__adwaaPortalCalendarConsistencyInstalled=true;const script=document\.createElement\('script'\);script\.async=false;script\.src='portal-admin-client\.js\?v=20260819-3'/);
  assert.match(subscription,/portal-dedicated-backend-compat\.js\?v=20260819-3/);
});

test('Staging يعطل reconciler القديم قبل تحميل عميل البوابة',async()=>{
  const subscription=await read('subscription-booking-type.js');
  const guardIndex=subscription.indexOf('window.__adwaaPortalCalendarConsistencyInstalled=true');
  const oldClientIndex=subscription.indexOf("script.src='portal-admin-client.js?v=20260819-3'");
  assert.ok(guardIndex>=0,'legacy reconciler guard must exist');
  assert.ok(oldClientIndex>guardIndex,'legacy reconciler must be disabled before the old auth client is loaded');
  assert.equal(subscription.match(/portal-admin-client\.js/g)?.length,1,'official loader must reference the old client only once');
});

test('الإدارة تستخدم قاعدة البوابة المخصصة ولا تغيّر core Supabase',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,new RegExp(`PORTAL_PROJECT_REF='${portalRef}'`));
  assert.match(compat,/window\.portalAdminClient=dedicatedClient/);
  assert.match(compat,/name\.startsWith\('customer_portal_'\)\?portalTableBuilder\(table\):currentFrom\(table\)/);
  assert.match(compat,/name\.startsWith\('customer-portal-'\)\?dedicatedClient\.storage\.from\(bucket\):currentStorageFrom\(bucket\)/);
  assert.match(compat,/storageKey:PORTAL_AUTH_STORAGE_KEY/);
  assert.match(compat,/signOut\(\{scope:'local'\}\)/);
  assert.doesNotMatch(compat,/window\.supabaseClient\s*=/);
});

test('جلسة بوابة العملاء لا تشارك مفتاح جلسة الإدارة ولا تنفذ تسجيل خروج شامل',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,/PORTAL_AUTH_STORAGE_KEY=`adwaa-portal-auth-\$\{PORTAL_PROJECT_REF\}`/);
  assert.doesNotMatch(compat,/dedicatedClient\.auth\.signOut\(\s*\)/);
});
