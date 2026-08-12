(()=>{
'use strict';
if(window.__adwaaPortalBookingAutoSyncInstalled)return;
window.__adwaaPortalBookingAutoSyncInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
const DELETE_JOURNAL_KEY='adwaaPortalPendingDeletesV1';
let syncing=false;
let syncTimer=0;
const pendingEdits=new Map();

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
  try{
    if(typeof window.portalUnavailableStatus==='function')window.portalUnavailableStatus(message,type);
  }catch(_){}
  if(type==='error')console.warn(message);
}
function readDeleteJournal(){
  try{
    const value=JSON.parse(localStorage.getItem(DELETE_JOURNAL_KEY)||'[]');
    return Array.isArray(value)?value:[];
  }catch(_){return []}
}
function writeDeleteJournal(items){
  try{localStorage.setItem(DELETE_JOURNAL_KEY,JSON.stringify(items))}catch(_){}
}
function rememberDeletedBooking(booking){
  if(!booking?.id)return;
  const map=mappingOf(booking);
  if(!Object.keys(map).length)return;
  const journal=readDeleteJournal().filter(item=>item?.bookingId!==booking.id);
  journal.push({bookingId:booking.id,map,createdAt:new Date().toISOString()});
  writeDeleteJournal(journal.slice(-50));
}
async function resolvePortalAdminClient(){
  const client=window.portalAdminClient;
  if(!client)return null;
  try{
    if(typeof window.verifyPortalAdminSession==='function'){
      const ok=await window.verifyPortalAdminSession();
      if(ok===true)return client;
      return null;
    }
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
function periodCovering(periods,date){
  return periods.find(period=>date>=period.start_date&&date<=period.end_date)||null;
}
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
async function saveMappingState(){
  if(typeof window.persist==='function')await window.persist();
}
async function flushPendingDeletes(client){
  const journal=readDeleteJournal();
  if(!journal.length)return 0;
  const remaining=[];
  let cleaned=0;
  for(const entry of journal){
    const stillExists=(state()?.bookings||[]).some(booking=>booking.id===entry.bookingId);
    if(stillExists){
      remaining.push(entry);
      continue;
    }
    try{
      for(const id of [...new Set(Object.values(entry.map||{}).filter(Boolean))])await deletePeriod(client,id);
      cleaned++;
    }catch(error){
      console.warn('تعذر تحرير أيام حجز محذوف من بوابة العملاء',error);
      remaining.push(entry);
    }
  }
  writeDeleteJournal(remaining);
  return cleaned;
}
function restoreEditMapping(){
  let restored=false;
  for(const [bookingId,oldMap] of pendingEdits){
    const booking=(state()?.bookings||[]).find(item=>item.id===bookingId);
    if(booking&&Object.keys(oldMap).length&&!Object.keys(mappingOf(booking)).length){
      booking[MAP_KEY]={...oldMap};
      restored=true;
    }
    pendingEdits.delete(bookingId);
  }
  return restored;
}
async function reconcileAll(reason='auto'){
  if(syncing||!Array.isArray(state()?.bookings))return false;
  syncing=true;
  try{
    const client=await resolvePortalAdminClient();
    if(!client){
      const detail=String(window.portalAdminAuthState?.error||'جلسة مدير البوابة غير متاحة');
      report(`تعذر مزامنة بوابة العملاء: ${detail}. سجّل خروج ثم دخول مرة واحدة لإعادة ربط جلسة البوابة.`,'error');
      return false;
    }

    const restored=restoreEditMapping();
    const deletedCount=await flushPendingDeletes(client);
    let periods=await loadPeriods(client);
    let stateChanged=restored;

    for(const booking of state().bookings){
      const desired=new Set(occupiedDates(booking));
      const oldMap=mappingOf(booking);
      const nextMap={...oldMap};

      for(const [date,id] of Object.entries(oldMap)){
        if(desired.has(date))continue;
        try{
          await deletePeriod(client,id);
          periods=periods.filter(period=>period.id!==id);
          delete nextMap[date];
        }catch(error){
          console.warn(`تعذر تحرير ${date} من بوابة العملاء`,error);
        }
      }

      for(const date of desired){
        if(nextMap[date])continue;
        if(periodCovering(periods,date))continue;
        try{
          const created=await createPeriod(client,date);
          if(created){periods.push(created);nextMap[date]=created.id}
        }catch(error){
          const message=String(error?.message||'');
          if(!/overlap|conflict|duplicate/i.test(message))throw error;
        }
      }

      if(!sameMap(oldMap,nextMap)){
        booking[MAP_KEY]=nextMap;
        stateChanged=true;
      }
    }

    if(stateChanged)await saveMappingState();
    const deletionText=deletedCount?`، وتم تحرير ${deletedCount} حجز محذوف`:'';
    report(`تمت مزامنة توفر بوابة العملاء (${reason})${deletionText}.`,'success');
    return true;
  }catch(error){
    console.error('فشل مزامنة توفر بوابة العملاء',error);
    report(`فشلت مزامنة بوابة العملاء: ${String(error?.message||'خطأ غير معروف')}`,'error');
    return false;
  }finally{
    syncing=false;
  }
}
function schedule(reason,delay=700){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>reconcileAll(reason),delay);
}
function captureEditBeforeSave(){
  const bookingId=String(document.getElementById('bId')?.value||'').trim();
  if(!bookingId)return;
  const booking=(state()?.bookings||[]).find(item=>item.id===bookingId);
  if(booking)pendingEdits.set(bookingId,mappingOf(booking));
}
function captureDeleteBeforeAction(){
  const bookingId=String(document.getElementById('bId')?.value||'').trim();
  if(!bookingId)return;
  const booking=(state()?.bookings||[]).find(item=>item.id===bookingId);
  if(booking)rememberDeletedBooking(booking);
}
function bindDirectEvents(){
  document.addEventListener('submit',event=>{
    if(!event.target?.closest?.('#bookingModal'))return;
    captureEditBeforeSave();
    schedule('حفظ أو تعديل حجز',1000);
  },true);
  document.addEventListener('click',event=>{
    if(!event.target?.closest?.('#deleteBookingBtn'))return;
    captureDeleteBeforeAction();
    schedule('حذف حجز',1100);
  },true);
  window.addEventListener('adwaa-subscription-updated',()=>schedule('تحديث اشتراك',500));
  window.addEventListener('focus',()=>schedule('عودة للنظام',300));
  window.addEventListener('online',()=>schedule('عودة الاتصال',300));
}
function initialize(){
  bindDirectEvents();
  schedule('فحص أولي',1200);
}
window.syncPortalAvailabilityFromBookings=()=>reconcileAll('مزامنة مباشرة');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
