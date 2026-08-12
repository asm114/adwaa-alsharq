(()=>{
'use strict';
if(window.__adwaaPortalBookingAutoSyncInstalled)return;
window.__adwaaPortalBookingAutoSyncInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
let syncing=false;
let syncTimer=0;

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
async function resolveAdminClient(){
  const candidates=[window.supabaseClient,window.portalAdminClient].filter(Boolean);
  for(const candidate of candidates){
    try{
      const {data:sessionData,error:sessionError}=await candidate.auth.getSession();
      if(sessionError||!sessionData?.session?.user)continue;
      const {data:isAdmin,error:adminError}=await candidate.rpc('is_resort_admin');
      if(!adminError&&isAdmin===true)return candidate;
    }catch(error){
      console.warn('تعذر التحقق من عميل إدارة بوابة العملاء',error);
    }
  }
  return null;
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
async function reconcileAll(reason='auto'){
  if(syncing||!Array.isArray(state()?.bookings))return false;
  syncing=true;
  try{
    const client=await resolveAdminClient();
    if(!client){
      report('تعذر مزامنة الحجوزات مع بوابة العملاء: جلسة المدير غير معتمدة. أعد تسجيل الدخول للنظام ثم حاول مرة أخرى.','error');
      return false;
    }
    let periods=await loadPeriods(client);
    let stateChanged=false;

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
          if(!/overlap|conflict|duplicate/i.test(message))console.warn(`تعذر إغلاق ${date} في بوابة العملاء`,error);
        }
      }

      if(!sameMap(oldMap,nextMap)){
        booking[MAP_KEY]=nextMap;
        stateChanged=true;
      }
    }

    if(stateChanged)await saveMappingState();
    report(`تمت مزامنة توفر بوابة العملاء من الحجوزات (${reason}).`,'success');
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
function bindDirectEvents(){
  document.addEventListener('submit',event=>{
    if(event.target?.closest?.('#bookingModal'))schedule('حفظ أو تعديل حجز',900);
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#deleteBookingBtn'))schedule('حذف حجز',900);
  },true);
  window.addEventListener('adwaa-subscription-updated',()=>schedule('تحديث اشتراك',500));
  window.addEventListener('focus',()=>schedule('عودة للنظام',300));
  window.addEventListener('online',()=>schedule('عودة الاتصال',300));
}
function initialize(){
  bindDirectEvents();
  schedule('فحص أولي',1000);
}
window.syncPortalAvailabilityFromBookings=()=>reconcileAll('مزامنة مباشرة');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
