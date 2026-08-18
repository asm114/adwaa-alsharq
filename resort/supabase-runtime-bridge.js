(()=>{
'use strict';

const config=window.ADWAA_SUPABASE_CONFIG;
const supabaseApi=window.supabase;
if(!config?.url||!config?.publishableKey||!supabaseApi?.createClient){
  throw new Error('تعذر تهيئة اتصال بوابة العملاء ببيئة Supabase المعتمدة.');
}

const STAGING_PROJECT_REF='ztqqdjryvecscidxxbfe';
const projectRefFromUrl=value=>{
  try{
    const hostname=new URL(String(value||'')).hostname.toLowerCase();
    return hostname.endsWith('.supabase.co')?hostname.slice(0,-'.supabase.co'.length):'';
  }catch(_){
    return '';
  }
};

const originalCreateClient=supabaseApi.createClient.bind(supabaseApi);
supabaseApi.createClient=function(url,key,options){
  const requestedRef=projectRefFromUrl(url);
  if(requestedRef===STAGING_PROJECT_REF){
    return originalCreateClient(config.url,config.publishableKey,options);
  }
  return originalCreateClient(url,key,options);
};
})();
