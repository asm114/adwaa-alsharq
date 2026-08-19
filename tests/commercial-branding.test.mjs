import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const legacyPortalRef='ztqqdjryvecscidxxbfe';
const legacyPortalKey='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';

test('إعداد العميل هو المصدر الوحيد للهوية التجارية الأساسية',async()=>{
  const config=await read('supabase-config.staging.js');
  for(const field of [
    "name:'CHANGE_ME_BRAND_NAME'",
    "businessType:'CHANGE_ME_BUSINESS_TYPE'",
    "location:'CHANGE_ME_LOCATION'",
    "description:'CHANGE_ME_BRAND_DESCRIPTION'"
  ])assert.match(config,new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(config,/displayName=brandName\.startsWith\(businessType\)\?brandName:`\$\{businessType\} \$\{brandName\}`/);
  assert.match(config,/installLegacyStorageNamespace\(commercialConfig\.namespace\.storage\)/);
  assert.match(config,/\/\^adwaa\/i\.test\(text\)/);
  assert.match(config,/commercial-branding\.js/);
});

test('طبقة الهوية تعمم النصوص والـManifest بدون MutationObserver',async()=>{
  const branding=await read('commercial-branding.js');
  assert.match(branding,/ADWAA_COMMERCIAL_CONFIG/);
  assert.match(branding,/brand\.displayName/);
  assert.match(branding,/brand\.location/);
  assert.match(branding,/link\[rel="manifest"\]/);
  assert.match(branding,/application\/manifest\+json/);
  assert.match(branding,/rewriteWhatsappLinks/);
  assert.doesNotMatch(branding,/MutationObserver/);
});

test('الـManifest الثابت محايد والـService Worker يعزل الكاش حسب مسار النسخة',async()=>{
  const [manifestText,worker]=await Promise.all([read('manifest.json'),read('sw.js')]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.name,'إدارة المنشأة');
  assert.equal(manifest.short_name,'الإدارة');
  assert.doesNotMatch(manifestText,/أضواء الشرق/);
  assert.match(worker,/self\.registration\.scope/);
  assert.match(worker,/CACHE_PREFIX=`commercial-\$\{SCOPE_KEY\}-`/);
  assert.match(worker,/key\.startsWith\(CACHE_PREFIX\)&&key!==CACHE/);
  assert.match(worker,/commercial-branding\.js/);
  assert.doesNotMatch(worker,/adwaa-staging|adwaa-staging-app-state/);
});

test('تشييك العامل يقرأ Backend بوابة العميل ويفشل مغلقًا',async()=>{
  const [html,workerCheck]=await Promise.all([read('worker-check.html'),read('worker-check-public.js')]);
  assert.ok(html.indexOf('supabase-config.staging.js')<html.indexOf('supabase-js@2'));
  assert.ok(html.indexOf('supabase-js@2')<html.indexOf('worker-check-public.js'));
  assert.match(workerCheck,/window\.ADWAA_PORTAL_SUPABASE_CONFIG/);
  assert.match(workerCheck,/إعداد Backend الخاص بالعميل غير مكتمل/);
  assert.match(workerCheck,/portalConfig\.url/);
  assert.match(workerCheck,/portalConfig\.publishableKey/);
  assert.doesNotMatch(workerCheck,new RegExp(legacyPortalRef));
  assert.doesNotMatch(workerCheck,new RegExp(legacyPortalKey.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
