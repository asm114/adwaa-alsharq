import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const legacyCoreRef='pgdvlklpyrvmwzitsmbw';
const legacyPortalRef='ztqqdjryvecscidxxbfe';

test('القالب التجاري لا يستنتج Supabase من hostname ولا يحمل مراجع أضواء الشرق في طبقة الإعداد',async()=>{
  const config=await read('supabase-config.staging.js');
  assert.match(config,/deploymentId:'CHANGE_ME_DEPLOYMENT_ID'/);
  assert.match(config,/runtimeEnvironment:'production'/);
  assert.match(config,/CHANGE_ME_CORE_PROJECT_REF/);
  assert.match(config,/CHANGE_ME_PORTAL_PROJECT_REF/);
  assert.match(config,/core\.projectRef===portal\.projectRef/);
  assert.doesNotMatch(config,/window\.location\?\.hostname|asm114\.github\.io/);
  assert.doesNotMatch(config,new RegExp(legacyCoreRef));
  assert.doesNotMatch(config,new RegExp(legacyPortalRef));
});

test('إعداد القالب التجاري يفشل مغلقًا قبل أي اتصال إذا بقيت قيم CHANGE_ME',async()=>{
  const source=await read('supabase-config.staging.js');
  const context={window:{},URL,console};
  assert.throws(()=>vm.runInNewContext(source,context),/القالب التجاري غير مهيأ/);
  assert.equal(context.window.ADWAA_SUPABASE_CONFIG,undefined);
  assert.equal(context.window.ADWAA_PORTAL_SUPABASE_CONFIG,undefined);
});

test('جسر البوابة يمنع أول اتصال عندما لا توجد إعدادات عميل',async()=>{
  const source=await read('resort/supabase-runtime-bridge.js');
  const original=(url,key,options)=>({url,key,options});
  const context={window:{supabase:{createClient:original}},console};
  vm.runInNewContext(source,context);
  assert.equal(context.window.__adwaaCustomerPortalBackendRef,'unconfigured');
  assert.throws(
    ()=>context.window.supabase.createClient(`https://${legacyPortalRef}.supabase.co`,'legacy-key',{}),
    /تم منع بوابة العميل من الاتصال/
  );
});

test('جسر البوابة يفرض Backend العميل المهيأ على أول createClient',async()=>{
  const source=await read('resort/supabase-runtime-bridge.js');
  const calls=[];
  const original=(url,key,options)=>{calls.push({url,key,options});return {ok:true}};
  const portalConfig={
    projectRef:'clientportalproject123',
    url:'https://clientportalproject123.supabase.co',
    publishableKey:'sb_publishable_client_portal'
  };
  const context={window:{supabase:{createClient:original},ADWAA_PORTAL_SUPABASE_CONFIG:portalConfig},console};
  vm.runInNewContext(source,context);
  const result=context.window.supabase.createClient(`https://${legacyPortalRef}.supabase.co`,'legacy-key',{auth:{persistSession:false}});
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,portalConfig.url);
  assert.equal(calls[0].key,portalConfig.publishableKey);
  assert.equal(context.window.__adwaaCustomerPortalBackendRef,portalConfig.projectRef);
});

test('Production لا يحمل عميل البوابة القديم الذي يشارك جلسة الإدارة',async()=>{
  const subscription=await read('subscription-booking-type.js');
  assert.match(subscription,/runtimeEnvironment==='production'\)return;const script=document\.createElement\('script'\);script\.async=false;script\.src='portal-admin-client\.js\?v=20260819-3'/);
  assert.match(subscription,/portal-dedicated-backend-compat\.js\?v=20260819-3/);
});

test('إدارة البوابة تقرأ Backend العميل من الإعداد وتستخدم Auth namespace خاصًا بالنسخة',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,/window\.ADWAA_PORTAL_SUPABASE_CONFIG/);
  assert.match(compat,/window\.ADWAA_COMMERCIAL_CONFIG/);
  assert.match(compat,/PORTAL_PROJECT_REF=portalConfig\.projectRef/);
  assert.match(compat,/PORTAL_SUPABASE_URL=portalConfig\.url/);
  assert.match(compat,/PORTAL_SUPABASE_PUBLISHABLE_KEY=portalConfig\.publishableKey/);
  assert.match(compat,/PORTAL_AUTH_STORAGE_KEY=`\$\{AUTH_NAMESPACE\}-portal-auth-\$\{PORTAL_PROJECT_REF\}`/);
  assert.match(compat,/window\.portalAdminClient=dedicatedClient/);
  assert.match(compat,/name\.startsWith\('customer_portal_'\)\?portalTableBuilder\(table\):currentFrom\(table\)/);
  assert.match(compat,/name\.startsWith\('customer-portal-'\)\?dedicatedClient\.storage\.from\(bucket\):currentStorageFrom\(bucket\)/);
  assert.match(compat,/signOut\(\{scope:'local'\}\)/);
  assert.doesNotMatch(compat,new RegExp(legacyPortalRef));
  assert.doesNotMatch(compat,/window\.supabaseClient\s*=/);
});
