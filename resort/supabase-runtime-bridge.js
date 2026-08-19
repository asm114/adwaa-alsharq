(()=>{
'use strict';

// Commercial portal backend marker.
// portal.js now reads the explicit per-customer backend directly; this file must
// never monkey-patch Supabase createClient or redirect the portal implicitly.
const portalConfig=window.ADWAA_PORTAL_SUPABASE_CONFIG||null;
if(!portalConfig?.url||!portalConfig?.publishableKey||!portalConfig?.projectRef){
  throw new Error('تم منع بوابة العميل من الاتصال لأن إعداد Backend الخاص بالعميل غير مكتمل.');
}
window.__adwaaCustomerPortalBackendRef=portalConfig.projectRef;
})();
