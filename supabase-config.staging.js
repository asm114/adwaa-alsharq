(()=>{
'use strict';

const STAGING_PROJECT_REF='ztqqdjryvecscidxxbfe';
const PRODUCTION_PROJECT_REF='pgdvlklpyrvmwzitsmbw';
const STAGING_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const PRODUCTION_PUBLISHABLE_KEY='sb_publishable_BFTIR_8VK2qQuKnl2c-jDA_cMnWz0E-';
const hostname=String(window.location?.hostname||'').toLowerCase();
const runtimeEnvironment=hostname==='asm114.github.io'?'production':'staging';

function projectRefFromUrl(value){
  const hostname=new URL(String(value||'')).hostname.toLowerCase();
  return hostname.endsWith('.supabase.co')?hostname.slice(0,-'.supabase.co'.length):'';
}

function validateStagingSupabaseConfig(config){
  if(config?.environment!=='staging')throw new Error('إعداد Supabase غير مخصص لطبقة التهيئة المعتمدة.');
  const projectRef=projectRefFromUrl(config.url);
  if(runtimeEnvironment==='production'){
    if(projectRef!==PRODUCTION_PROJECT_REF)throw new Error(`تم منع Production من الاتصال بمشروع Supabase غير معتمد: ${projectRef||'غير معروف'}`);
  }else{
    if(projectRef===PRODUCTION_PROJECT_REF)throw new Error('تم منع تشغيل Staging على مشروع Supabase الخاص بـProduction.');
    if(projectRef!==STAGING_PROJECT_REF)throw new Error(`Project Ref غير معتمد لبيئة Staging: ${projectRef||'غير معروف'}`);
  }
  if(!String(config.publishableKey||'').startsWith('sb_publishable_'))throw new Error('مفتاح Supabase العام غير صالح أو مفقود.');
  return Object.freeze({...config,projectRef,runtimeEnvironment});
}

window.__adwaaValidateStagingSupabaseConfig=validateStagingSupabaseConfig;
const activeProjectRef=runtimeEnvironment==='production'?PRODUCTION_PROJECT_REF:STAGING_PROJECT_REF;
const activePublishableKey=runtimeEnvironment==='production'?PRODUCTION_PUBLISHABLE_KEY:STAGING_PUBLISHABLE_KEY;
window.ADWAA_SUPABASE_CONFIG=validateStagingSupabaseConfig({
  environment:'staging',
  url:`https://${activeProjectRef}.supabase.co`,
  publishableKey:activePublishableKey
});
})();
