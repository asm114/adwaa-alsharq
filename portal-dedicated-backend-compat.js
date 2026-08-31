(()=>{
'use strict';
if(window.__adwaaDedicatedPortalBackendInstalled)return;
window.__adwaaDedicatedPortalBackendInstalled=true;

const PORTAL_PROJECT_REF='ztqqdjryvecscidxxbfe';
const PORTAL_SUPABASE_URL=`https://${PORTAL_PROJECT_REF}.supabase.co`;
const PORTAL_SUPABASE_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const PORTAL_AUTH_STORAGE_KEY=`adwaa-portal-auth-${PORTAL_PROJECT_REF}`;

function makeCredentialSaveNonBlocking(){
  const original=window.saveManagerCredentialPreference;
  if(typeof original!=='function'||original.__adwaaNonBlocking)return;
  const wrapped=async function(email,password){
    try{
      const task=Promise.resolve(original(email,password));
      task.catch(err=>console.warn('تعذر حفظ بيانات الدخول في مدير كلمات المرور.',err));
      await Promise.race([task,new Promise(resolve=>setTimeout(resolve,60))]);
    }catch(err){
      console.warn('تعذر حفظ تفضيل بيانات الدخول.',err);
    }
  };
  wrapped.__adwaaNonBlocking=true;
  wrapped.__original=original;
  window.saveManagerCredentialPreference=wrapped;
}

function install(){
  if(!window.supabase?.createClient)return false;
  makeCredentialSaveNonBlocking();
  const dedicatedClient=window.supabase.createClient(
    PORTAL_SUPABASE_URL,
    PORTAL_SUPABASE_PUBLISHABLE_KEY,
    {auth:{storageKey:PORTAL_AUTH_STORAGE_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}
  );
  window.portalAdminClient=dedicatedClient;
  window.portalAdminAuthState={ready:false,error:'',userId:''};

  function auditPayload(value){
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
    const builder=dedicatedClient.from(table);
    return new Proxy(builder,{
      get(target,property,receiver){
        if(['insert','upsert','update'].includes(property))return (values,...args)=>target[property].call(target,auditPayload(values),...args);
        const value=Reflect.get(target,property,receiver);
        return typeof value==='function'?value.bind(target):value;
      }
    });
  }

  const core=window.supabaseClient;
  if(core){
    const currentFrom=core.from.bind(core);
    core.from=function(table){
      const name=String(table||'');
      return name.startsWith('customer_portal_')?portalTableBuilder(table):currentFrom(table);
    };
    if(core.storage?.from){
      const currentStorageFrom=core.storage.from.bind(core.storage);
      core.storage.from=function(bucket){
        const name=String(bucket||'');
        return name.startsWith('customer-portal-')?dedicatedClient.storage.from(bucket):currentStorageFrom(bucket);
      };
    }
  }

  function setReady(userId=''){
    const wasReady=window.portalAdminAuthState?.ready===true;
    window.portalAdminAuthState={ready:true,error:'',userId:String(userId||'')};
    if(!wasReady)window.dispatchEvent(new CustomEvent('adwaa-portal-admin-ready'));
  }
  async function verify(){
    const {data:sessionData,error:sessionError}=await dedicatedClient.auth.getSession();
    const user=sessionData?.session?.user||null;
    if(sessionError||!user){window.portalAdminAuthState={ready:false,error:sessionError?.message||'لا توجد جلسة مدير للبوابة',userId:''};return false}
    const {data:isAdmin,error:adminError}=await dedicatedClient.rpc('is_resort_admin');
    if(adminError||isAdmin!==true){window.portalAdminAuthState={ready:false,error:adminError?.message||'الحساب ليس مديرًا نشطًا للبوابة',userId:String(user.id||'')};return false}
    setReady(user.id);return true;
  }
  async function signIn(email,password){
    if(!email||!password)return false;
    const {error}=await dedicatedClient.auth.signInWithPassword({email,password});
    if(error){window.portalAdminAuthState={ready:false,error:error.message||'تعذر تسجيل دخول مدير البوابة',userId:''};return false}
    const valid=await verify();
    if(!valid){try{await dedicatedClient.auth.signOut({scope:'local'})}catch(_){}}
    return valid;
  }
  window.verifyPortalAdminSession=verify;
  window.signInPortalAdminWithCredentials=signIn;

  const previousLogin=window.loginManager;
  if(typeof previousLogin==='function'&&!previousLogin.__dedicatedPortalWrapped){
    const wrapped=async function(event){
      const email=String(document.getElementById('loginEmail')?.value||'').trim().toLowerCase();
      const password=String(document.getElementById('loginPassword')?.value||'');
      const result=await previousLogin.call(this,event);
      try{
        const {data}=await window.supabaseClient?.auth?.getSession?.();
        if(data?.session?.user&&email&&password)await signIn(email,password);
      }catch(err){console.warn('تعذر ربط جلسة بوابة العملاء المخصصة.',err)}
      return result;
    };
    wrapped.__dedicatedPortalWrapped=true;
    window.loginManager=wrapped;
  }

  window.supabaseClient?.auth?.onAuthStateChange?.(event=>{
    if(event==='SIGNED_OUT'){
      window.portalAdminAuthState={ready:false,error:'تم تسجيل الخروج',userId:''};
      dedicatedClient.auth.signOut({scope:'local'}).catch(()=>{});
    }
  });
  verify().catch(()=>{});
  return true;
}

if(!install()){
  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    if(install()||attempts>=40)clearInterval(timer);
  },250);
}
})();

(()=>{const script=document.createElement('script');script.async=false;script.src='portal-unavailable-ownership-guard.js?v=20260831-1';script.onerror=()=>console.warn('تعذر تحميل حماية ملكية فترات بوابة العملاء');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='data-protection-status-clarity.js?v=20260831-1';script.onerror=()=>console.warn('تعذر تحميل توضيح أسباب حالة حماية البيانات');document.head.appendChild(script)})();
