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

(()=>{
'use strict';
if(window.__adwaaPortalCalendarConsistencyInstalled)return;
window.__adwaaPortalCalendarConsistencyInstalled=true;
const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
let checking=false;
const state=()=>window.db;
const activeBooking=booking=>booking&&booking.status!=='ملغي'&&booking.date;
function addDays(iso,days){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function occupiedDates(booking){if(!activeBooking(booking))return[];const days=booking.type==='مبيت'?Math.max(1,Number(booking.stayDays||1)):1;return Array.from({length:days},(_,i)=>addDays(booking.date,i))}
function mappingOf(booking){const value=booking?.[MAP_KEY];return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{}}
function covering(periods,date){return periods.find(period=>date>=period.start_date&&date<=period.end_date)||null}
function report(message,type=''){try{window.portalUnavailableStatus?.(message,type)}catch(_){}if(type==='error')console.warn(message)}
async function verifyCalendarConsistency(reason='فحص تلقائي'){
  if(checking||!Array.isArray(state()?.bookings))return false;
  checking=true;
  try{
    if(!(await window.verifyPortalAdminSession?.()))return false;
    let {data:periods,error}=await window.portalAdminClient.from(TABLE).select('id,start_date,end_date').order('start_date',{ascending:true});
    if(error)throw error;periods=Array.isArray(periods)?periods:[];
    let repaired=0;
    for(const booking of state().bookings){
      for(const date of occupiedDates(booking)){
        if(covering(periods,date))continue;
        const {data:created,error:createError}=await window.portalAdminClient.from(TABLE).insert({start_date:date,end_date:date}).select('id,start_date,end_date').single();
        if(createError)throw createError;
        if(created){periods.push(created);const map=mappingOf(booking);map[date]=created.id;booking[MAP_KEY]=map;repaired++}
      }
    }
    if(repaired&&typeof window.persist==='function')await window.persist();
    const desired=new Set(state().bookings.flatMap(occupiedDates));
    const missing=[...desired].filter(date=>!covering(periods,date));
    const ownedIds=new Set(state().bookings.flatMap(booking=>Object.values(mappingOf(booking))).filter(Boolean));
    const unexplained=periods.filter(period=>period.start_date===period.end_date&&!desired.has(period.start_date)&&!ownedIds.has(period.id));
    window.portalCalendarConsistency={ok:missing.length===0,missingDates:missing,unexplainedSingleDays:unexplained.map(period=>period.start_date),checkedAt:new Date().toISOString()};
    if(missing.length){report(`تقويم العملاء غير متوافق: ${missing.length} تاريخ حجز ما زال ظاهرًا متاحًا.`,'error');return false}
    if(repaired)report(`تم إصلاح توافق تقويم العملاء وإغلاق ${repaired} تاريخ كان ناقصًا.`,'success');
    if(unexplained.length)console.info(`يوجد ${unexplained.length} تاريخ مفرد مغلق غير مملوك لحجز حالي؛ تُرك دون حذف لحماية الإغلاقات اليدوية.`);
    return true;
  }catch(error){console.error('فشل فحص توافق تقويم العملاء',error);report(`تعذر فحص توافق تقويم العملاء: ${String(error?.message||'خطأ غير معروف')}`,'error');return false}
  finally{checking=false}
}
window.verifyPortalCalendarConsistency=verifyCalendarConsistency;
window.addEventListener('adwaa-portal-admin-ready',()=>setTimeout(()=>verifyCalendarConsistency('جلسة البوابة'),1200));
document.addEventListener('submit',event=>{if(event.target?.id==='bookingForm')setTimeout(()=>verifyCalendarConsistency('بعد حفظ الحجز'),3800)});
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(()=>verifyCalendarConsistency('بعد تحديث الاشتراك'),1800));
})();
