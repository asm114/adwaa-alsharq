(()=>{
'use strict';

// Commercial template configuration.
// This branch is intentionally fail-closed: replace every CHANGE_ME_* value
// for a customer installation before the application is allowed to connect.
const rawCommercialConfig={
  schemaVersion:1,
  deploymentId:'CHANGE_ME_DEPLOYMENT_ID',
  runtimeEnvironment:'production',
  basePath:'/CHANGE_ME_BASE_PATH/',
  namespace:{
    storage:'CHANGE_ME_STORAGE_NAMESPACE',
    auth:'CHANGE_ME_AUTH_NAMESPACE',
    cache:'CHANGE_ME_CACHE_NAMESPACE'
  },
  brand:{
    name:'CHANGE_ME_BRAND_NAME',
    businessType:'CHANGE_ME_BUSINESS_TYPE',
    location:'CHANGE_ME_LOCATION',
    description:'CHANGE_ME_BRAND_DESCRIPTION'
  },
  backends:{
    core:{
      projectRef:'CHANGE_ME_CORE_PROJECT_REF',
      publishableKey:'CHANGE_ME_CORE_PUBLISHABLE_KEY'
    },
    portal:{
      projectRef:'CHANGE_ME_PORTAL_PROJECT_REF',
      publishableKey:'CHANGE_ME_PORTAL_PUBLISHABLE_KEY'
    }
  }
};

function configuredValue(label,value){
  const text=String(value||'').trim();
  if(!text||text.startsWith('CHANGE_ME_'))throw new Error(`القالب التجاري غير مهيأ: ${label}.`);
  return text;
}

function projectRefFromUrl(value){
  const hostname=new URL(String(value||'')).hostname.toLowerCase();
  return hostname.endsWith('.supabase.co')?hostname.slice(0,-'.supabase.co'.length):'';
}

function validateBackend(label,backend){
  const projectRef=configuredValue(`${label}.projectRef`,backend?.projectRef).toLowerCase();
  if(!/^[a-z0-9]{10,40}$/.test(projectRef))throw new Error(`Project Ref غير صالح في ${label}.`);
  const publishableKey=configuredValue(`${label}.publishableKey`,backend?.publishableKey);
  if(!publishableKey.startsWith('sb_publishable_'))throw new Error(`Publishable Key غير صالح في ${label}.`);
  const url=`https://${projectRef}.supabase.co`;
  if(projectRefFromUrl(url)!==projectRef)throw new Error(`تعذر التحقق من عنوان Supabase في ${label}.`);
  return Object.freeze({projectRef,publishableKey,url});
}

function validateCommercialConfig(config){
  if(Number(config?.schemaVersion)!==1)throw new Error('إصدار إعدادات القالب التجاري غير مدعوم.');
  const deploymentId=configuredValue('deploymentId',config?.deploymentId).toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(deploymentId))throw new Error('deploymentId غير صالح. استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.');
  const runtimeEnvironment=String(config?.runtimeEnvironment||'').toLowerCase();
  if(!['production','staging'].includes(runtimeEnvironment))throw new Error('runtimeEnvironment يجب أن يكون production أو staging.');
  const basePath=configuredValue('basePath',config?.basePath);
  if(!basePath.startsWith('/')||!basePath.endsWith('/'))throw new Error('basePath يجب أن يبدأ وينتهي بعلامة /.');
  const namespace=Object.freeze({
    storage:configuredValue('namespace.storage',config?.namespace?.storage),
    auth:configuredValue('namespace.auth',config?.namespace?.auth),
    cache:configuredValue('namespace.cache',config?.namespace?.cache)
  });
  const brandName=configuredValue('brand.name',config?.brand?.name);
  const businessType=configuredValue('brand.businessType',config?.brand?.businessType);
  const displayName=brandName.startsWith(businessType)?brandName:`${businessType} ${brandName}`;
  const brand=Object.freeze({
    name:brandName,
    businessType,
    displayName,
    location:configuredValue('brand.location',config?.brand?.location),
    description:configuredValue('brand.description',config?.brand?.description),
    mark:[...brandName.replace(/\s+/g,'')][0]||'•'
  });
  const core=validateBackend('backends.core',config?.backends?.core);
  const portal=validateBackend('backends.portal',config?.backends?.portal);
  if(core.projectRef===portal.projectRef)throw new Error('القالب الحالي يتطلب Backend منفصلًا للإدارة وبوابة العميل.');
  return Object.freeze({
    schemaVersion:1,
    deploymentId,
    runtimeEnvironment,
    basePath,
    namespace,
    brand,
    backends:Object.freeze({core,portal})
  });
}

function installLegacyStorageNamespace(prefix){
  const StorageCtor=window.Storage,proto=StorageCtor?.prototype;
  if(!proto||proto.__commercialNamespaceInstalled)return;
  const originalGet=proto.getItem,originalSet=proto.setItem,originalRemove=proto.removeItem;
  const targetKey=(storage,key)=>{
    const text=String(key??'');
    if(storage!==window.localStorage&&storage!==window.sessionStorage)return text;
    if(!/^adwaa/i.test(text))return text;
    return `${prefix}:${text}`;
  };
  Object.defineProperty(proto,'__commercialNamespaceInstalled',{value:true,configurable:false});
  proto.getItem=function(key){return originalGet.call(this,targetKey(this,key))};
  proto.setItem=function(key,value){return originalSet.call(this,targetKey(this,key),value)};
  proto.removeItem=function(key){return originalRemove.call(this,targetKey(this,key))};
}

function validateCoreSupabaseConfig(config){
  const projectRef=projectRefFromUrl(config?.url);
  if(!projectRef||projectRef!==window.ADWAA_COMMERCIAL_CONFIG?.backends?.core?.projectRef)throw new Error('تم منع الاتصال بقاعدة إدارة غير مطابقة لإعداد النسخة.');
  if(!String(config?.publishableKey||'').startsWith('sb_publishable_'))throw new Error('مفتاح Supabase العام غير صالح أو مفقود.');
  return Object.freeze({...config,projectRef,runtimeEnvironment:window.ADWAA_COMMERCIAL_CONFIG.runtimeEnvironment});
}

const commercialConfig=validateCommercialConfig(rawCommercialConfig);
window.ADWAA_COMMERCIAL_CONFIG=commercialConfig;
installLegacyStorageNamespace(commercialConfig.namespace.storage);
window.ADWAA_SUPABASE_CONFIG=validateCoreSupabaseConfig({
  environment:commercialConfig.runtimeEnvironment,
  url:commercialConfig.backends.core.url,
  publishableKey:commercialConfig.backends.core.publishableKey
});
window.ADWAA_PORTAL_SUPABASE_CONFIG=Object.freeze({
  environment:commercialConfig.runtimeEnvironment,
  ...commercialConfig.backends.portal
});

// Compatibility alias for existing runtime code while the commercial branch is refactored.
window.__adwaaValidateStagingSupabaseConfig=validateCoreSupabaseConfig;

// A customer deployment marked production must never instantiate the legacy shared portal client.
if(commercialConfig.runtimeEnvironment==='production'){
  window.__adwaaPortalAdminClientInstalled=true;
  window.__adwaaLegacyPortalAdminDisabled=true;
}

// Branding is deliberately a separate runtime layer so the legacy single-file UI can
// be generalized without a high-risk rewrite. It never runs if configuration validation fails.
if(typeof document!=='undefined'&&!window.__commercialBrandingLoaderInstalled){
  window.__commercialBrandingLoaderInstalled=true;
  const script=document.createElement('script');
  script.async=false;
  script.src=`${commercialConfig.basePath}commercial-branding.js?v=20260819-1`;
  document.head.appendChild(script);
}
})();
