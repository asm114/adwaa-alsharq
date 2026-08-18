(()=>{
'use strict';

const STAGING_PROJECT_REF='ztqqdjryvecscidxxbfe';
const PRODUCTION_PROJECT_REF='pgdvlklpyrvmwzitsmbw';

function projectRefFromUrl(value){
  const hostname=new URL(String(value||'')).hostname.toLowerCase();
  return hostname.endsWith('.supabase.co')?hostname.slice(0,-'.supabase.co'.length):'';
}

function validateStagingSupabaseConfig(config){
  if(config?.environment!=='staging')throw new Error('إعداد Supabase غير مخصص لبيئة Staging.');
  const projectRef=projectRefFromUrl(config.url);
  if(projectRef===PRODUCTION_PROJECT_REF)throw new Error('تم منع تشغيل Staging على مشروع Supabase الخاص بـProduction.');
  if(projectRef!==STAGING_PROJECT_REF)throw new Error(`Project Ref غير معتمد لبيئة Staging: ${projectRef||'غير معروف'}`);
  if(!String(config.publishableKey||'').startsWith('sb_publishable_'))throw new Error('مفتاح Supabase العام لبيئة Staging غير صالح أو مفقود.');
  return Object.freeze({...config,projectRef});
}

window.__adwaaValidateStagingSupabaseConfig=validateStagingSupabaseConfig;
window.ADWAA_SUPABASE_CONFIG=validateStagingSupabaseConfig({
  environment:'staging',
  url:`https://${STAGING_PROJECT_REF}.supabase.co`,
  publishableKey:'sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD'
});
})();
