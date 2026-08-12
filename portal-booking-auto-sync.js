(()=>{
'use strict';
if(window.__adwaaPortalBookingAutoSyncInstalled)return;
window.__adwaaPortalBookingAutoSyncInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
let syncing=false;
let readyScheduled=false;

const state=()=>window.db;
const client=()=>window.supabaseClient;
const userId=()=>window.currentUser?.id||null;
const activeBooking=booking=>booking&&booking.status!=='ملغي'&&booking.date;

function addDays(iso,days){
  const date=new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate()+days);
  const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function occupiedDates(booking){
  if(!activeBooking(booking))return [];
  try{
    if(typeof window.bookingOccupiedDates==='function')return [...new Set(window.bookingOccupiedDates(booking).filter(Boolean))];
  }catch(error){console.warn('تعذر استخدام حساب أيام الحجز الأساسي',error)}
  const days=booking.type==='مبيت'?Math.max(1,Number(booking.stayDays||1)):1;
  return Array.from({length:days},(_,index)=>addDays(booking.date,index));
}
function mappingOf(booking){
  const value=booking?.[MAP_KEY];
  return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};
}
function sameMap(a,b){
  const aKeys=Object.keys(a).sort(),bKeys=Object.keys(b).sort();
  return aKeys.length===bKeys.length&&aKeys.every((key,index)=>key===bKeys[index]&&a[key]===b[key]);
}
async function findCoveringPeriod(date){
  const supabase=client();if(!supabase)return null;
  const {data,error}=await supabase.from(TABLE).select('id,start_date,end_date').lte('start_date',date).gte('end_date',date).order('start_date',{ascending:true}).limit(1);
  if(error)throw error;
  return Array.isArray(data)&&data.length?data[0]:null;
}
async function createOwnedPeriod(date){
  const supabase=client();if(!supabase)return null;
  const {data,error}=await supabase.from(TABLE).insert({start_date:date,end_date:date,updated_by:userId()}).select('id').single();
  if(error)throw error;
  return data?.id||null;
}
async function deleteOwnedPeriod(id){
  if(!id||!client())return false;
  const {error}=await client().from(TABLE).delete().eq('id',id);
  if(error)throw error;
  return true;
}
async function saveState(){
  if(typeof window.persist==='function')await window.persist();
}
async function syncBooking(booking,previousMap=null,{persistState=true}={}){
  if(!booking||!client())return false;
  const desired=new Set(occupiedDates(booking));
  const oldMap=previousMap?{...previousMap}:mappingOf(booking);
  const nextMap={...oldMap};
  let changed=false;

  for(const [date,id] of Object.entries(oldMap)){
    if(desired.has(date))continue;
    try{await deleteOwnedPeriod(id);delete nextMap[date];changed=true}
    catch(error){console.warn(`تعذر تحرير تاريخ ${date} من بوابة العملاء`,error)}
  }

  for(const date of desired){
    if(nextMap[date])continue;
    try{
      const existing=await findCoveringPeriod(date);
      if(existing)continue;
      const id=await createOwnedPeriod(date);
      if(id){nextMap[date]=id;changed=true}
    }catch(error){
      const message=String(error?.message||'');
      if(/overlap|conflict|duplicate/i.test(message))continue;
      console.warn(`تعذر مزامنة تاريخ الحجز ${date} مع بوابة العملاء`,error);
    }
  }

  if(!sameMap(mappingOf(booking),nextMap)){
    booking[MAP_KEY]=nextMap;changed=true;
  }
  if(changed&&persistState)await saveState();
  return changed;
}
async function reconcileAll(){
  if(syncing||!state()?.bookings||!client())return;
  syncing=true;
  try{
    let changed=false;
    for(const booking of state().bookings){
      if(await syncBooking(booking,null,{persistState:false}))changed=true;
    }
    if(changed)await saveState();
  }finally{syncing=false}
}
function wrapSaveBooking(){
  if(typeof window.saveBooking!=='function'||window.saveBooking.__portalAutoSyncWrapped)return;
  const original=window.saveBooking;
  const wrapped=async function(...args){
    const beforeIds=new Set((state()?.bookings||[]).map(item=>item.id));
    const editingId=String(document.getElementById('bId')?.value||'');
    const previous=editingId?(state()?.bookings||[]).find(item=>item.id===editingId):null;
    const previousMap=previous?mappingOf(previous):{};
    const result=await original.apply(this,args);
    const currentBookings=state()?.bookings||[];
    const saved=editingId?currentBookings.find(item=>item.id===editingId):currentBookings.find(item=>!beforeIds.has(item.id));
    if(saved){
      if(Object.keys(previousMap).length&&!Object.keys(mappingOf(saved)).length)saved[MAP_KEY]=previousMap;
      await syncBooking(saved,previousMap);
    }
    return result;
  };
  wrapped.__portalAutoSyncWrapped=true;
  wrapped.__base=original;
  window.saveBooking=wrapped;
}
function wrapDeleteBooking(){
  if(typeof window.deleteBooking!=='function'||window.deleteBooking.__portalAutoSyncWrapped)return;
  const original=window.deleteBooking;
  const wrapped=async function(...args){
    const id=String(document.getElementById('bId')?.value||'');
    const previous=(state()?.bookings||[]).find(item=>item.id===id);
    const previousMap=previous?mappingOf(previous):{};
    const result=await original.apply(this,args);
    const stillExists=(state()?.bookings||[]).some(item=>item.id===id);
    if(previous&&!stillExists){
      for(const periodId of Object.values(previousMap)){
        try{await deleteOwnedPeriod(periodId)}catch(error){console.warn('تعذر تحرير تاريخ حجز محذوف من بوابة العملاء',error)}
      }
    }
    return result;
  };
  wrapped.__portalAutoSyncWrapped=true;
  wrapped.__base=original;
  window.deleteBooking=wrapped;
}
function install(){
  wrapSaveBooking();wrapDeleteBooking();
  const ready=!!client()&&Array.isArray(state()?.bookings)&&typeof window.saveBooking==='function'&&typeof window.deleteBooking==='function';
  if(!ready){setTimeout(install,500);return}
  if(!readyScheduled){readyScheduled=true;setTimeout(reconcileAll,800)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,400),{once:true});else setTimeout(install,400);
window.addEventListener('focus',()=>setTimeout(reconcileAll,250));
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(reconcileAll,250));
})();
