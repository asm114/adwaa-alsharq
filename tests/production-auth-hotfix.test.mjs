import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Production يعطل عميل بوابة الإدارة القديم قبل أن ينشئ Supabase client',async()=>{
  const [config,legacy]=await Promise.all([
    read('supabase-config.staging.js'),
    read('portal-admin-client.js')
  ]);
  assert.match(config,/if\(runtimeEnvironment==='production'\)[\s\S]*window\.__adwaaPortalAdminClientInstalled=true/);
  assert.match(config,/window\.__adwaaLegacyPortalAdminDisabled=true/);
  assert.match(legacy,/if\(portalSupabaseConfig\?\.runtimeEnvironment==='production'\)[\s\S]*return;/);
  assert.ok(
    legacy.indexOf("runtimeEnvironment==='production'")<legacy.indexOf('window.supabase.createClient('),
    'Production guard must execute before the legacy client can create a Supabase auth client.'
  );
});

test('Service Worker يتجاوز كاش المتصفح للملفات المحلية بعد إصلاح جلسة الدخول',async()=>{
  const worker=await read('sw.js');
  assert.match(worker,/const sameOrigin=new URL\(event\.request\.url\)\.origin===self\.location\.origin/);
  assert.match(worker,/fetch\(event\.request,sameOrigin\?\{cache:'no-store'\}:\{\}\)/);
});
