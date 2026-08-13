(()=>{
'use strict';
if(window.__adwaaPortalBookingSyncStableInstalled)return;
window.__adwaaPortalBookingSyncStableInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
let syncing=false;
let rerunRequested=false;
const pendingEdits=new Map();
const pendingDeletes=new Map();

const state=()=>window.db;
const activeBooking=booking=>booking&&booking.status!=='ملغي'&&booking.date;

function addDays(iso,days){
  const date=new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate()+days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function occupiedDates(booking){
  if(!activeBooking(booking))return [];
  const days=booking.type==='مبيت'?Math.max(1,Number(booking.stayDays||1)):1;
  return Array.from({length:days},(_,index)=>addDays(booking.date,index));
}
function mappingOf(booking){
  const value=booking?.[MAP_KEY];
  return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};
}
function sameMap(a,b){
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length&&ak.every((key,index)=>key===bk[index]&&a[key]===b[key]);
}
function report(message,type=''){
  try{window.portalUnavailableStatus?.(message,type)}catch(_){}
  if(type==='error')console.warn(message);
}
function coreWriteState(){
  try{
    return{known:true,ready:remoteReady===true,stamp:String(lastSuccessfulWriteAt||'')};
  }catch(_){return{known:false,ready:true,stamp:''}}
}
function coreWriteSucceeded(before){
  const after=coreWriteState();
  if(!after.ready)return false;
  if(!before?.known||!after.known)return true;
  return !!after.stamp&&after.stamp!==before.stamp;
}
function coreStateIsSynced(){return coreWriteState().ready}
async function resolvePortalAdminClient(){
  const client=window.portalAdminClient;
  if(!client)return null;
  try{
    if(typeof window.verifyPortalAdminSession==='function')return await window.verifyPortalAdminSession()===true?client:null;
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session?.user)return null;
    const {data:isAdmin,error:adminError}=await client.rpc('is_resort_admin');
    return !adminError&&isAdmin===true?client:null;
  }catch(error){
    console.warn('تعذر التحقق من جلسة مدير بوابة العملاء',error);
    return null;
  }
}
async function loadPeriods(client){
  const {data,error}=await client.from(TABLE).select('id,start_date,end_date').order('start_date',{ascending:true});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
function periodCovering(periods,date){return periods.find(period=>date>=period.start_date&&date<=period.end_date)||null}
async function createPeriod(client,date){
  const {data,error}=await client.from(TABLE).insert({start_date:date,end_date:date}).select('id,start_date,end_date').single();
  if(error)throw error;
  return data||null;
}
async function deletePeriod(client,id){
  if(!id)return;
  const {error}=await client.from(TABLE).delete().eq('id',id);
  if(error)throw error;
}
async function saveMappingState(){if(typeof window.persist==='function')await window.persist()}

function restoreEditMappings(){
  let restored=false;
  for(const [bookingId,oldMap] of [...pendingEdits]){
    const booking=(state()?.bookings||[]).find(item=>item.id===bookingId);
    if(booking&&Object.keys(oldMap).length&&!Object.keys(mappingOf(booking)).length){booking[MAP_KEY]={...oldMap};restored=true}
    pendingEdits.delete(bookingId);
  }
  return restored;
}
async function flushCapturedDeletes(client){
  let cleaned=0;
  for(const [bookingId,map] of [...pendingDeletes]){
    const stillExists=(state()?.bookings||[]).some(booking=>booking.id===bookingId);
    if(stillExists){pendingDeletes.delete(bookingId);continue}
    for(const id of [...new Set(Object.values(map||{}).filter(Boolean))])await deletePeriod(client,id);
    pendingDeletes.delete(bookingId);
    cleaned++;
  }
  return cleaned;
}
async function reconcileAll(reason='auto'){
  if(!Array.isArray(state()?.bookings))return false;
  if(!coreStateIsSynced()){
    report('لم تتم مزامنة بوابة العملاء لأن آخر تعديل في نظام الإدارة لم يُرفع إلى Supabase بعد.','error');
    return false;
  }
  if(syncing){rerunRequested=true;return false}
  syncing=true;
  try{
    const client=await resolvePortalAdminClient();
    if(!client){
      const detail=String(window.portalAdminAuthState?.error||'جلسة مدير البوابة غير متاحة');
      report(`تعذر مزامنة بوابة العملاء: ${detail}.`,'error');
      return false;
    }

    const restored=restoreEditMappings();
    const deletedCount=await flushCapturedDeletes(client);
    let periods=await loadPeriods(client);
    let stateChanged=restored;

    for(const booking of state().bookings){
      const desired=new Set(occupiedDates(booking));
      const oldMap=mappingOf(booking);
      const nextMap={...oldMap};

      for(const [date,id] of Object.entries(oldMap)){
        if(desired.has(date))continue;
        await deletePeriod(client,id);
        periods=periods.filter(period=>period.id!==id);
        delete nextMap[date];
      }

      for(const date of desired){
        if(nextMap[date]||periodCovering(periods,date))continue;
        try{
          const created=await createPeriod(client,date);
          if(created){periods.push(created);nextMap[date]=created.id}
        }catch(error){
          const message=String(error?.message||'');
          if(!/overlap|conflict|duplicate/i.test(message))throw error;
        }
      }

      if(!sameMap(oldMap,nextMap)){booking[MAP_KEY]=nextMap;stateChanged=true}
    }

    if(stateChanged)await saveMappingState();
    report(`تمت مزامنة توفر بوابة العملاء (${reason})${deletedCount?`، وتحرير ${deletedCount} حجز محذوف`:''}.`,'success');
    return true;
  }catch(error){
    console.error('فشل مزامنة توفر بوابة العملاء',error);
    report(`فشلت مزامنة بوابة العملاء: ${String(error?.message||'خطأ غير معروف')}`,'error');
    return false;
  }finally{
    syncing=false;
    if(rerunRequested){rerunRequested=false;queueMicrotask(()=>reconcileAll('تحديث متزامن'))}
  }
}
function currentBooking(){
  const bookingId=String(document.getElementById('bId')?.value||'').trim();
  return bookingId?(state()?.bookings||[]).find(item=>item.id===bookingId)||null:null;
}
function installBookingHooks(){
  const save=window.saveBooking;
  if(typeof save==='function'&&!save.__portalStableSyncWrapped){
    const wrapped=async function(...args){
      const beforeBooking=currentBooking();
      if(beforeBooking)pendingEdits.set(beforeBooking.id,mappingOf(beforeBooking));
      const writeBefore=coreWriteState();
      const result=await save.apply(this,args);
      if(!coreWriteSucceeded(writeBefore)){
        if(beforeBooking)pendingEdits.delete(beforeBooking.id);
        return result;
      }
      await reconcileAll(beforeBooking?'تعديل حجز':'حفظ حجز');
      return result;
    };
    wrapped.__portalStableSyncWrapped=true;wrapped.__base=save;
    try{saveBooking=wrapped}catch(_){}
    window.saveBooking=wrapped;
  }

  const remove=window.deleteBooking;
  if(typeof remove==='function'&&!remove.__portalStableSyncWrapped){
    const wrapped=async function(...args){
      const beforeBooking=currentBooking();
      if(beforeBooking)pendingDeletes.set(beforeBooking.id,mappingOf(beforeBooking));
      const writeBefore=coreWriteState();
      const result=await remove.apply(this,args);
      if(!beforeBooking)return result;
      const stillExists=(state()?.bookings||[]).some(booking=>booking.id===beforeBooking.id);
      if(stillExists){pendingDeletes.delete(beforeBooking.id);return result}
      if(!coreWriteSucceeded(writeBefore))return result;
      await reconcileAll('حذف حجز');
      return result;
    };
    wrapped.__portalStableSyncWrapped=true;wrapped.__base=remove;
    try{deleteBooking=wrapped}catch(_){}
    window.deleteBooking=wrapped;
  }
}
function initialize(){
  try{localStorage.removeItem('adwaaPortalPendingDeletesV1')}catch(_){}
  installBookingHooks();
  setTimeout(installBookingHooks,600);
  window.addEventListener('adwaa-subscription-updated',()=>{if(coreStateIsSynced())queueMicrotask(()=>reconcileAll('تحديث اشتراك'))});
  window.addEventListener('adwaa-portal-admin-ready',()=>{if(coreStateIsSynced())queueMicrotask(()=>reconcileAll('جلسة بوابة العملاء جاهزة'))});
  if(window.portalAdminAuthState?.ready===true&&coreStateIsSynced())queueMicrotask(()=>reconcileAll('فحص أولي'));
}
window.syncPortalAvailabilityFromBookings=()=>reconcileAll('مزامنة مباشرة');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
