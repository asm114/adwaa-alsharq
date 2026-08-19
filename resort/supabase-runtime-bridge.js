(()=>{
'use strict';

// Temporary commercial-template bridge.
// The public portal still creates its Supabase client inside portal.js. Until that
// file is fully generalized, force the first client creation to use the explicit
// per-customer portal backend from the commercial configuration layer.
const supabaseApi=window.supabase;
if(!supabaseApi?.createClient)throw new Error('Supabase client library is unavailable for the customer portal.');

const originalCreateClient=supabaseApi.createClient.bind(supabaseApi);
const portalConfig=window.ADWAA_PORTAL_SUPABASE_CONFIG||null;
let firstClientPending=true;

supabaseApi.createClient=function(_url,_publishableKey,options){
  if(!firstClientPending)return originalCreateClient(_url,_publishableKey,options);
  firstClientPending=false;
  supabaseApi.createClient=originalCreateClient;
  if(!portalConfig?.url||!portalConfig?.publishableKey||!portalConfig?.projectRef){
    throw new Error('تم منع بوابة العميل من الاتصال لأن إعداد Backend الخاص بالعميل غير مكتمل.');
  }
  return originalCreateClient(portalConfig.url,portalConfig.publishableKey,options);
};

window.__adwaaCustomerPortalBackendRef=portalConfig?.projectRef||'unconfigured';
})();
