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
window.portalAdminAuthState={ready:false,error:'',userId:''};

function portalAuditPayload(value){
  const userId=window.portalAdminAuthState?.userId||null;
  const rewrite=row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))return row;
    const copy={...row};
    for(const key of ['updated_by','admin_id','created_by'])if(Object.prototype.hasOwnProperty.call(copy,key))copy[key]=userId;
    return copy;
  };
  return Array.isArray(value)?value.map(rewrite):rewrite(value);
}

function portalTableBuilder(table){
  const builder=portalAdminClient.from(table);
  return new Proxy(builder,{
    get(target,property,receiver){
      if(['insert','upsert','update'].includes(property)){
        return (values,...args)=>target[property].call(target,portalAuditPayload(values),...args);
      }
      const value=Reflect.get(target,property,receiver);
      return typeof value==='function'?value.bind(target):value;
    }
  });
}

function installPortalDataRouter(){
  const core=window.supabaseClient;
  if(!core||core.__adwaaPortalDataRouterInstalled)return;
  const coreFrom=core.from.bind(core);
  core.from=function(table){
    const name=String(table||'');
    return name.startsWith('customer_portal_')?portalTableBuilder(table):coreFrom(table);
  };
  if(core.storage?.from){
    const coreStorageFrom=core.storage.from.bind(core.storage);
    core.storage.from=function(bucket){
      const name=String(bucket||'');
      return name.startsWith('customer-portal-')?portalAdminClient.storage.from(bucket):coreStorageFrom(bucket);
    };
  }
  core.__adwaaPortalDataRouterInstalled=true;
}

function refreshPortalAdminViews(){
  const calls=[
    'loadPortalResortInfo','loadPortalImages','loadPortalUnavailablePeriods','loadPortalPricing','loadPortalSeasons','loadPortalContact',
    'loadPortalFinalSummary','loadPortalFeedback','loadPortalActivityLog'
  ];
  calls.forEach(name=>{
    try{
      const fn=window[name];
      if(typeof fn==='function')Promise.resolve(fn()).catch(error=>console.warn(`تعذر تحديث ${name}`,error));
    }catch(error){console.warn(`تعذر تحديث ${name}`,error)}
  });
}

function setPortalAdminReady(userId=''){
  const wasReady=window.portalAdminAuthState?.ready===true;
  window.portalAdminAuthState={ready:true,error:'',userId:String(userId||'')};
  if(!wasReady){
    window.dispatchEvent(new CustomEvent('adwaa-portal-admin-ready'));
    queueMicrotask(refreshPortalAdminViews);
  }
}

async function verifyPortalAdmin(){
  const {data:sessionData,error:sessionError}=await portalAdminClient.auth.getSession();
  const user=sessionData?.session?.user||null;
  if(sessionError||!user){
    window.portalAdminAuthState={ready:false,error:sessionError?.message||'لا توجد جلسة مدير للبوابة',userId:''};
    return false;
  }
  const {data:isAdmin,error:adminError}=await portalAdminClient.rpc('is_resort_admin');
  if(adminError||isAdmin!==true){
    window.portalAdminAuthState={ready:false,error:adminError?.message||'الحساب ليس مديرًا نشطًا للبوابة',userId:String(user.id||'')};
    return false;
  }
  setPortalAdminReady(user.id);
  return true;
}

async function signInPortalAdminWithCredentials(email,password){
  if(!email||!password)return false;
  const {error}=await portalAdminClient.auth.signInWithPassword({email,password});
  if(error){
    window.portalAdminAuthState={ready:false,error:error.message||'تعذر تسجيل دخول مدير البوابة',userId:''};
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

installPortalDataRouter();

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
      window.portalAdminAuthState={ready:false,error:String(err?.message||err||'تعذر ربط جلسة البوابة'),userId:''};
      console.warn('تعذر ربط جلسة مدير البوابة.',err);
    }
  };
}

window.supabaseClient?.auth?.onAuthStateChange?.((event)=>{
  if(event==='SIGNED_OUT'){
    window.portalAdminAuthState={ready:false,error:'تم تسجيل الخروج',userId:''};
    portalAdminClient.auth.signOut().catch(()=>{});
  }
});

verifyPortalAdmin().catch(()=>{});
})();
