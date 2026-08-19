(()=>{
'use strict';
if(window.__adwaaPortalAdminClientInstalled)return;
const portalSupabaseConfig=window.ADWAA_SUPABASE_CONFIG;
if(portalSupabaseConfig?.runtimeEnvironment==='production'){
  window.__adwaaPortalAdminClientInstalled=true;
  window.__adwaaLegacyPortalAdminDisabled=true;
  return;
}
if(!portalSupabaseConfig||portalSupabaseConfig.environment!=='staging'){
  throw new Error('تم منع عميل بوابة الإدارة من العمل دون إعداد Staging المعتمد.');
}
window.__adwaaValidateStagingSupabaseConfig?.(portalSupabaseConfig);
window.__adwaaPortalAdminClientInstalled=true;

const PORTAL_SUPABASE_URL=portalSupabaseConfig.url;
const PORTAL_SUPABASE_PUBLISHABLE_KEY=portalSupabaseConfig.publishableKey;

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
const SOURCE_BOOKING='booking';
const SOURCE_LEGACY='legacy';
let checking=false;
const state=()=>window.db;
const activeBooking=booking=>booking&&booking.status!=='ملغي'&&booking.date&&booking.id;
const bookingId=booking=>String(booking?.id||'');
function addDays(iso,days){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function occupiedDates(booking){if(!activeBooking(booking))return[];const days=booking.type==='مبيت'?Math.max(1,Number(booking.stayDays||1)):1;return Array.from({length:days},(_,i)=>addDays(booking.date,i))}
function mappingOf(booking){const value=booking?.[MAP_KEY];return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{}}
function sameMap(a,b){const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((key,index)=>key===bk[index]&&a[key]===b[key])}
function covering(periods,date){return periods.find(period=>date>=period.start_date&&date<=period.end_date)||null}
function exactDay(period,date){return period?.start_date===date&&period?.end_date===date}
function report(message,type=''){try{window.portalUnavailableStatus?.(message,type)}catch(_){}if(type==='error')console.warn(message)}
async function loadPeriods(){
  const {data,error}=await window.portalAdminClient.from(TABLE).select('id,start_date,end_date,source_type,booking_id').order('start_date',{ascending:true});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
async function createBookingPeriod(date,id){
  const {data,error}=await window.portalAdminClient.from(TABLE).insert({start_date:date,end_date:date,source_type:SOURCE_BOOKING,booking_id:id}).select('id,start_date,end_date,source_type,booking_id').single();
  if(error)throw error;
  return data||null;
}
async function adoptLegacyPeriod(period,id){
  const {data,error}=await window.portalAdminClient.from(TABLE).update({source_type:SOURCE_BOOKING,booking_id:id}).eq('id',period.id).eq('source_type',SOURCE_LEGACY).select('id,start_date,end_date,source_type,booking_id').maybeSingle();
  if(error)throw error;
  return data||period;
}
async function deleteOwnedPeriod(period){
  const {error}=await window.portalAdminClient.from(TABLE).delete().eq('id',period.id).eq('source_type',SOURCE_BOOKING);
  if(error)throw error;
}
async function persistMappings(){
  if(typeof window.persist!=='function')return;
  await window.persist();
}
async function verifyCalendarConsistency(reason='فحص تلقائي'){
  if(checking||!Array.isArray(state()?.bookings))return false;
  checking=true;
  try{
    if(!(await window.verifyPortalAdminSession?.()))return false;
    const bookings=state().bookings.filter(activeBooking);
    const desiredByBooking=new Map(bookings.map(booking=>[bookingId(booking),new Set(occupiedDates(booking))]));
    let periods=await loadPeriods();
    let cleaned=0,created=0,adopted=0,stateChanged=false;

    for(const period of [...periods]){
      if(period.source_type!==SOURCE_BOOKING)continue;
      const desired=desiredByBooking.get(String(period.booking_id||''));
      if(desired&&exactDay(period,period.start_date)&&desired.has(period.start_date))continue;
      await deleteOwnedPeriod(period);
      periods=periods.filter(item=>item.id!==period.id);
      cleaned++;
    }

    const ownershipConflicts=[];
    const manualCoveredBookingDates=[];
    for(const booking of bookings){
      const id=bookingId(booking);
      const oldMap=mappingOf(booking);
      const nextMap={};
      for(const date of occupiedDates(booking)){
        let period=covering(periods,date);
        if(!period){
          period=await createBookingPeriod(date,id);
          if(period){periods.push(period);created++}
        }else if(period.source_type===SOURCE_LEGACY&&exactDay(period,date)){
          period=await adoptLegacyPeriod(period,id);
          const index=periods.findIndex(item=>item.id===period.id);
          if(index>=0)periods[index]=period;
          adopted++;
        }
        if(period?.source_type===SOURCE_BOOKING&&String(period.booking_id||'')===id){
          nextMap[date]=period.id;
        }else if(period?.source_type===SOURCE_BOOKING){
          ownershipConflicts.push(date);
        }else if(period){
          manualCoveredBookingDates.push(date);
        }
      }
      if(!sameMap(oldMap,nextMap)){booking[MAP_KEY]=nextMap;stateChanged=true}
    }

    if(stateChanged)await persistMappings();
    const desired=new Set(bookings.flatMap(occupiedDates));
    const missing=[...desired].filter(date=>!covering(periods,date));
    const unexplained=periods.filter(period=>period.source_type===SOURCE_LEGACY&&period.start_date===period.end_date&&!desired.has(period.start_date));
    window.portalCalendarConsistency={
      ok:missing.length===0&&ownershipConflicts.length===0,
      missingDates:missing,
      unexplainedSingleDays:unexplained.map(period=>period.start_date),
      legacyUnownedSingleDays:unexplained.map(period=>period.start_date),
      manualCoveredBookingDates:[...new Set(manualCoveredBookingDates)],
      ownershipConflicts:[...new Set(ownershipConflicts)],
      createdBookingClosures:created,
      adoptedLegacyClosures:adopted,
      cleanedBookingClosures:cleaned,
      checkedAt:new Date().toISOString(),
      reason
    };
    if(missing.length||ownershipConflicts.length){report(`تقويم العملاء غير متوافق: ${missing.length+ownershipConflicts.length} تاريخ يحتاج مراجعة.`,'error');return false}
    if(created||adopted||cleaned)report(`تم تصحيح ربط تقويم العملاء: إضافة ${created}، اعتماد ${adopted}، تحرير ${cleaned}.`,'success');
    if(unexplained.length)console.info(`يوجد ${unexplained.length} تاريخ قديم غير مملوك لحجز حالي؛ تُرك دون حذف حتى تتم مراجعته بأمان.`);
    return true;
  }catch(error){console.error('فشل فحص توافق تقويم العملاء',error);report(`تعذر فحص توافق تقويم العملاء: ${String(error?.message||'خطأ غير معروف')}`,'error');return false}
  finally{checking=false}
}
window.verifyPortalCalendarConsistency=verifyCalendarConsistency;
window.addEventListener('adwaa-portal-admin-ready',()=>setTimeout(()=>verifyCalendarConsistency('جلسة البوابة'),1200));
document.addEventListener('submit',event=>{if(event.target?.id==='bookingForm')setTimeout(()=>verifyCalendarConsistency('بعد حفظ الحجز'),3800)});
document.addEventListener('click',event=>{if(event.target?.closest?.('#deleteBookingBtn'))setTimeout(()=>verifyCalendarConsistency('بعد حذف الحجز'),3800)});
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(()=>verifyCalendarConsistency('بعد تحديث الاشتراك'),1800));
})();
