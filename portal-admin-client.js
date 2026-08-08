(()=>{
'use strict';
if(window.__adwaaPortalAdminClientInstalled)return;
window.__adwaaPortalAdminClientInstalled=true;

const PORTAL_SUPABASE_URL='https://ztqqdjryvecscidxxbfe.supabase.co';
const PORTAL_SUPABASE_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';

if(!window.supabase?.createClient){
  console.warn('تعذر تهيئة عميل بوابة العملاء: مكتبة Supabase غير متاحة.');
  return;
}

const portalAdminClient=window.supabase.createClient(
  PORTAL_SUPABASE_URL,
  PORTAL_SUPABASE_PUBLISHABLE_KEY,
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}
);
window.portalAdminClient=portalAdminClient;
window.portalAdminAuthState={ready:false,error:''};

async function verifyPortalAdmin(){
  const {data:sessionData,error:sessionError}=await portalAdminClient.auth.getSession();
  if(sessionError||!sessionData?.session?.user){
    window.portalAdminAuthState={ready:false,error:sessionError?.message||'لا توجد جلسة مدير للبوابة'};
    return false;
  }
  const {data:isAdmin,error:adminError}=await portalAdminClient.rpc('is_resort_admin');
  if(adminError||isAdmin!==true){
    window.portalAdminAuthState={ready:false,error:adminError?.message||'الحساب ليس مديرًا نشطًا للبوابة'};
    return false;
  }
  window.portalAdminAuthState={ready:true,error:''};
  return true;
}

async function signInPortalAdminWithCredentials(email,password){
  if(!email||!password)return false;
  const {error}=await portalAdminClient.auth.signInWithPassword({email,password});
  if(error){
    window.portalAdminAuthState={ready:false,error:error.message||'تعذر تسجيل دخول مدير البوابة'};
    console.warn('تعذر فتح جلسة مدير بوابة العملاء.',error.message||error);
    return false;
  }
  const valid=await verifyPortalAdmin();
  if(!valid){
    try{await portalAdminClient.auth.signOut()}catch(_){}
  }
  return valid;
}

window.verifyPortalAdminSession=verifyPortalAdmin;
window.signInPortalAdminWithCredentials=signInPortalAdminWithCredentials;

const originalLogin=window.loginManager;
if(typeof originalLogin==='function'&&!window.__adwaaPortalLoginWrapped){
  window.__adwaaPortalLoginWrapped=true;
  window.loginManager=async function(event){
    const email=String(document.getElementById('loginEmail')?.value||'').trim().toLowerCase();
    const password=String(document.getElementById('loginPassword')?.value||'');
    await originalLogin.call(this,event);
    try{
      const {data}=await window.supabaseClient?.auth?.getSession?.();
      if(data?.session?.user&&email&&password)await signInPortalAdminWithCredentials(email,password);
    }catch(err){
      window.portalAdminAuthState={ready:false,error:String(err?.message||err||'تعذر ربط جلسة البوابة')};
      console.warn('تعذر ربط جلسة مدير البوابة.',err);
    }
  };
}

window.supabaseClient?.auth?.onAuthStateChange?.((event)=>{
  if(event==='SIGNED_OUT')portalAdminClient.auth.signOut().catch(()=>{});
});

verifyPortalAdmin().catch(()=>{});
})();
