(()=>{
'use strict';
if(window.__adwaaPortalBookingSyncStableInstalled)return;
window.__adwaaPortalBookingSyncStableInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
const SOURCE_BOOKING='booking';
const CORE_SYNC_ALERT='تعذر مزامنة آخر تعديل';
let syncing=false;
let rerunRequested=false;
let bookingSaveInFlight=false;
let bookingDeleteInFlight=false;
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
  try{return{known:true,ready:remoteReady===true,stamp:String(lastSuccessfulWriteAt||'')}}catch(_){return{known:false,ready:true,stamp:''}}
}
function coreWriteSucceeded(before){
  const after=coreWriteState();
  if(!after.ready)return false;
  if(!before?.known||!after.known)return true;
  return !!after.stamp&&after.stamp!==before.stamp;
}
function coreStateIsSynced(){return coreWriteState().ready}
function bookingForm(){return document.getElementById('bookingForm')}
function bookingSubmitButton(){return bookingForm()?.querySelector('button[type="submit"]')||null}
function deleteButton(){return document.getElementById('deleteBookingBtn')}

function ensureBookingSaveUi(){
  if(!document.getElementById('bookingSaveUxStyle')){
    const style=document.createElement('style');style.id='bookingSaveUxStyle';style.textContent=`
      .booking-save-progress{grid-column:1/-1;display:none;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:800;line-height:1.6}
      .booking-save-progress.show{display:flex}.booking-save-progress.loading{background:#eef6ff;color:#285b9b;border:1px solid #bfd5ef}.booking-save-progress.success{background:#eef8f4;color:#14785f;border:1px solid #b8ddcf}.booking-save-progress.error{background:#fff1f1;color:#a63c3c;border:1px solid #edc1c1}.booking-save-progress.warning{background:#fff8e8;color:#8b6500;border:1px solid #e8cd86}
      .booking-save-spinner{width:15px;height:15px;border:2px solid currentColor;border-left-color:transparent;border-radius:50%;animation:bookingSaveSpin .7s linear infinite}@keyframes bookingSaveSpin{to{transform:rotate(360deg)}}
      .booking-save-toast{position:fixed;z-index:12000;right:14px;bottom:calc(18px + env(safe-area-inset-bottom));max-width:min(420px,calc(100vw - 28px));padding:12px 14px;border-radius:14px;box-shadow:0 14px 38px rgba(0,0,0,.18);font-size:13px;font-weight:800;line-height:1.65;background:#173f36;color:#fff;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s ease}.booking-save-toast.show{opacity:1;transform:none}.booking-save-toast.error{background:#9f3939}.booking-save-toast.warning{background:#8a681c}
      #bookingForm button[aria-busy="true"]{opacity:.72;cursor:wait;transform:none!important}
    `;document.head.appendChild(style);
  }
  const form=bookingForm();if(!form)return null;
  let status=document.getElementById('bookingSaveProgress');
  if(!status){status=document.createElement('div');status.id='bookingSaveProgress';status.className='booking-save-progress';status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.appendChild(status)}
  return status;
}
function setBookingProgress(message,type='loading'){
  const status=ensureBookingSaveUi();if(!status)return;
  status.className=`booking-save-progress show ${type}`;
  status.innerHTML=`${type==='loading'?'<span class="booking-save-spinner" aria-hidden="true"></span>':''}<span>${String(message||'')}</span>`;
}
function clearBookingProgress(delay=0){
  const run=()=>{const status=document.getElementById('bookingSaveProgress');if(status){status.className='booking-save-progress';status.textContent=''}};
  if(delay)setTimeout(run,delay);else run();
}
let toastTimer=0;
function showBookingToast(message,type='success',duration=2600){
  ensureBookingSaveUi();
  let toast=document.getElementById('bookingSaveToast');
  if(!toast){toast=document.createElement('div');toast.id='bookingSaveToast';toast.className='booking-save-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.appendChild(toast)}
  toast.textContent=String(message||'');toast.className=`booking-save-toast ${type} show`;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.classList.remove('show')},duration);
}
function setBusyButton(button,busy,busyText='جاري الحفظ...'){
  if(!button)return;
  if(!button.dataset.bookingDefaultText)button.dataset.bookingDefaultText=button.textContent||'حفظ';
  button.disabled=!!busy;
  button.setAttribute('aria-busy',busy?'true':'false');
  button.textContent=busy?busyText:button.dataset.bookingDefaultText;
}
async function withCapturedCoreSyncAlert(task){
  const nativeAlert=window.alert;
  let captured=false;
  window.alert=function(message){
    const text=String(message??'');
    if(text.includes(CORE_SYNC_ALERT)){captured=true;return}
    return nativeAlert.call(window,message);
  };
  try{return{result:await task(),captured}}finally{window.alert=nativeAlert}
}
function currentBooking(){
  const bookingId=String(document.getElementById('bId')?.value||'').trim();
  return bookingId?(state()?.bookings||[]).find(item=>item.id===bookingId)||null:null;
}
function bookingByCode(code){return (state()?.bookings||[]).find(item=>String(item?.code||'')===String(code||''))||null}
function fingerprint(value){try{return JSON.stringify(value??null)}catch(_){return String(value??'')}}

async function resolvePortalAdminClient(){
  const client=window.portalAdminClient;
  if(!client)return null;
  try{
    if(typeof window.verifyPortalAdminSession==='function')return await window.verifyPortalAdminSession()===true?client:null;
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session?.user)return null;
    const {data:isAdmin,error:adminError}=await client.rpc('is_resort_admin');
    return !adminError&&isAdmin===true?client:null;
  }catch(error){console.warn('تعذر التحقق من جلسة مدير بوابة العملاء',error);return null}
}
async function loadPeriods(client){
  const {data,error}=await client.from(TABLE).select('id,start_date,end_date,source_type,booking_id').order('start_date',{ascending:true});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
function periodCoversDate(period,date){return !!period&&date>=period.start_date&&date<=period.end_date}
function periodOwnedByBooking(period,bookingId,date){
  return !!period&&period.source_type===SOURCE_BOOKING&&String(period.booking_id||'')===String(bookingId||'')&&periodCoversDate(period,date);
}
function periodById(periods,id){return id?periods.find(period=>period.id===id)||null:null}
function ownedPeriodForDate(periods,bookingId,date){return periods.find(period=>periodOwnedByBooking(period,bookingId,date))||null}
function conflictingPeriodForDate(periods,bookingId,date){return periods.find(period=>periodCoversDate(period,date)&&!periodOwnedByBooking(period,bookingId,date))||null}
async function createPeriod(client,date,bookingId){
  const owner=String(bookingId||'').trim();
  if(!owner)throw new Error('تعذر إنشاء إغلاق الحجز بدون معرف ملكية.');
  const {data,error}=await client.from(TABLE).insert({start_date:date,end_date:date,source_type:SOURCE_BOOKING,booking_id:owner}).select('id,start_date,end_date,source_type,booking_id').single();
  if(error)throw error;
  return data||null;
}
async function deletePeriod(client,id,bookingId){
  if(!id)return;
  let query=client.from(TABLE).delete().eq('id',id).eq('source_type',SOURCE_BOOKING);
  const owner=String(bookingId||'').trim();
  if(owner)query=query.eq('booking_id',owner);
  const {error}=await query;
  if(error)throw error;
}
async function deletePeriodsForBooking(client,bookingId){
  const owner=String(bookingId||'').trim();
  if(!owner)return;
  const {error}=await client.from(TABLE).delete().eq('source_type',SOURCE_BOOKING).eq('booking_id',owner);
  if(error)throw error;
}
async function deleteObsoleteBookingPeriods(client,periods,desiredByBooking){
  let cleaned=0;
  const desiredDates=new Set();
  for(const desired of desiredByBooking.values())for(const date of desired)desiredDates.add(date);
  for(const period of [...periods]){
    if(period.source_type!==SOURCE_BOOKING)continue;
    const owner=String(period.booking_id||'');
    const ownerKnown=desiredByBooking.has(owner);
    const desired=desiredByBooking.get(owner);
    const exactOwnedDay=period.start_date===period.end_date&&desired?.has(period.start_date);
    if(exactOwnedDay)continue;
    const conflictsWithDesired=!ownerKnown&&[...desiredDates].some(date=>periodCoversDate(period,date));
    if(conflictsWithDesired)continue;
    await deletePeriod(client,period.id,owner);
    periods=periods.filter(item=>item.id!==period.id);
    cleaned++;
  }
  return{periods,cleaned};
}
async function saveMappingState(){
  if(typeof window.persist!=='function')return true;
  const before=coreWriteState();
  const {captured}=await withCapturedCoreSyncAlert(()=>window.persist());
  const ok=coreWriteSucceeded(before);
  if(captured&&!ok)console.warn('تعذر حفظ خريطة ربط بوابة العملاء في Supabase.');
  return ok;
}

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
    await deletePeriodsForBooking(client,bookingId);
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
    const desiredByBooking=new Map(state().bookings.map(booking=>[String(booking.id||''),new Set(occupiedDates(booking))]));
    const cleanup=await deleteObsoleteBookingPeriods(client,periods,desiredByBooking);
    periods=cleanup.periods;
    const conflicts=[];

    for(const booking of state().bookings){
      const desired=new Set(occupiedDates(booking));
      const oldMap=mappingOf(booking);
      const nextMap={};

      for(const [date,id] of Object.entries(oldMap)){
        if(desired.has(date))continue;
        const mapped=periodById(periods,id);
        if(mapped&&mapped.source_type===SOURCE_BOOKING&&String(mapped.booking_id||'')===String(booking.id||'')){
          await deletePeriod(client,id,booking.id);
          periods=periods.filter(period=>period.id!==id);
        }
      }

      for(const date of desired){
        const mapped=periodById(periods,oldMap[date]);
        if(periodOwnedByBooking(mapped,booking.id,date)){
          nextMap[date]=mapped.id;
          continue;
        }
        const existing=ownedPeriodForDate(periods,booking.id,date);
        if(existing){
          nextMap[date]=existing.id;
          continue;
        }
        const conflict=conflictingPeriodForDate(periods,booking.id,date);
        if(conflict){
          conflicts.push({bookingId:String(booking.id||''),date,periodId:conflict.id,sourceType:conflict.source_type,owner:String(conflict.booking_id||'')});
          continue;
        }
        try{
          const created=await createPeriod(client,date,booking.id);
          if(created){periods.push(created);nextMap[date]=created.id}
        }catch(error){
          const message=String(error?.message||'');
          if(!/overlap|conflict|duplicate/i.test(message))throw error;
        }
      }

      if(!sameMap(oldMap,nextMap)){booking[MAP_KEY]=nextMap;stateChanged=true}
    }

    if(stateChanged&&!(await saveMappingState())){
      throw new Error('تم تحديث توفر البوابة، لكن تعذر تثبيت خريطة الربط في Supabase. بقيت الخريطة محفوظة على هذا الجهاز وستدخل مع أول حفظ ناجح لاحقًا.');
    }
    window.portalBookingSyncLastResult={ok:conflicts.length===0,reason,conflicts,cleanedBookingPeriods:cleanup.cleaned,deletedBookings:deletedCount};
    if(conflicts.length){
      report(`اكتملت المزامنة مع وجود ${conflicts.length} تعارض في التواريخ. لم يتم تغيير السجلات المتعارضة.`,'error');
      return false;
    }
    report(`تمت مزامنة توفر بوابة العملاء (${reason})${cleanup.cleaned?`، وتنظيف ${cleanup.cleaned} سجل قديم`:''}${deletedCount?`، وتحرير ${deletedCount} حجز محذوف`:''}.`,'success');
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
function syncPortalInBackground(reason){
  queueMicrotask(async()=>{
    const ok=await reconcileAll(reason);
    if(!ok)showBookingToast('تم حفظ الحجز، لكن بوابة العملاء لم تتزامن بعد. لن يتكرر الحفظ تلقائيًا.', 'warning',4200);
  });
}
function reopenFailedBooking(savedBooking){
  if(!savedBooking?.id)return;
  setTimeout(()=>{
    try{window.openBooking?.(savedBooking.id);setBookingProgress('لم يكتمل الرفع للسحابة. هذا نفس الحجز مفتوح الآن لإعادة المحاولة دون إنشاء حجز مكرر.','error')}catch(error){console.warn('تعذر إعادة فتح الحجز بعد فشل المزامنة',error)}
  },0);
}
function installBookingHooks(){
  const save=window.saveBooking;
  if(typeof save==='function'&&!save.__portalStableSyncWrapped){
    const wrapped=async function(...args){
      const event=args[0];
      if(bookingSaveInFlight){event?.preventDefault?.();setBookingProgress('الحفظ جارٍ بالفعل، انتظر حتى يكتمل.','loading');return false}
      bookingSaveInFlight=true;
      const button=bookingSubmitButton();setBusyButton(button,true,'جاري حفظ الحجز...');setBookingProgress('جاري حفظ الحجز في نظام الإدارة...','loading');
      const beforeBooking=currentBooking();
      const beforeFingerprint=fingerprint(beforeBooking);
      const codeBefore=String(document.getElementById('bCode')?.value||'').trim();
      if(beforeBooking)pendingEdits.set(beforeBooking.id,mappingOf(beforeBooking));
      const writeBefore=coreWriteState();
      try{
        const {result}=await withCapturedCoreSyncAlert(()=>save.apply(this,args));
        const savedBooking=beforeBooking?(state()?.bookings||[]).find(item=>item.id===beforeBooking.id)||null:bookingByCode(codeBefore);
        const changed=beforeBooking?!!savedBooking&&fingerprint(savedBooking)!==beforeFingerprint:!!savedBooking;
        if(!changed){if(beforeBooking)pendingEdits.delete(beforeBooking.id);clearBookingProgress();return result}
        if(!coreWriteSucceeded(writeBefore)){
          if(beforeBooking)pendingEdits.delete(beforeBooking.id);
          showBookingToast('تعذر رفع الحجز للسحابة. لم ننشئ حجزًا ثانيًا؛ افتحنا نفس الحجز لإعادة المحاولة.','error',5200);
          reopenFailedBooking(savedBooking);
          return result;
        }
        setBookingProgress('تم حفظ الحجز بنجاح. تحديث بوابة العملاء سيكمل بالخلفية.','success');
        showBookingToast('تم حفظ الحجز ✓','success',1800);
        syncPortalInBackground(beforeBooking?'تعديل حجز':'حفظ حجز');
        return result;
      }finally{
        bookingSaveInFlight=false;setBusyButton(button,false);clearBookingProgress(2200);
      }
    };
    wrapped.__portalStableSyncWrapped=true;wrapped.__base=save;
    try{saveBooking=wrapped}catch(_){}
    window.saveBooking=wrapped;
  }

  const remove=window.deleteBooking;
  if(typeof remove==='function'&&!remove.__portalStableSyncWrapped){
    const wrapped=async function(...args){
      if(bookingDeleteInFlight)return false;
      bookingDeleteInFlight=true;
      const beforeBooking=currentBooking();
      const button=deleteButton();setBusyButton(button,true,'جاري الحذف...');
      if(beforeBooking)pendingDeletes.set(beforeBooking.id,mappingOf(beforeBooking));
      const writeBefore=coreWriteState();
      try{
        const {result}=await withCapturedCoreSyncAlert(()=>remove.apply(this,args));
        if(!beforeBooking)return result;
        const stillExists=(state()?.bookings||[]).some(booking=>booking.id===beforeBooking.id);
        if(stillExists){pendingDeletes.delete(beforeBooking.id);return result}
        if(!coreWriteSucceeded(writeBefore)){
          showBookingToast('تم الحذف على هذا الجهاز فقط وتعذر رفعه للسحابة. لا تُعد المحاولة الآن قبل عودة الاتصال.','error',5200);
          return result;
        }
        showBookingToast('تم حذف الحجز ✓','success',1800);
        syncPortalInBackground('حذف حجز');
        return result;
      }finally{bookingDeleteInFlight=false;setBusyButton(button,false,'جاري الحذف...')}
    };
    wrapped.__portalStableSyncWrapped=true;wrapped.__base=remove;
    try{deleteBooking=wrapped}catch(_){}
    window.deleteBooking=wrapped;
  }
}
function initialize(){
  try{localStorage.removeItem('adwaaPortalPendingDeletesV1')}catch(_){}
  ensureBookingSaveUi();
  installBookingHooks();
  setTimeout(installBookingHooks,600);
  window.addEventListener('adwaa-subscription-updated',()=>{if(coreStateIsSynced())queueMicrotask(()=>reconcileAll('تحديث اشتراك'))});
  window.addEventListener('adwaa-portal-admin-ready',()=>{if(coreStateIsSynced())queueMicrotask(()=>reconcileAll('جلسة بوابة العملاء جاهزة'))});
  if(window.portalAdminAuthState?.ready===true&&coreStateIsSynced())queueMicrotask(()=>reconcileAll('فحص أولي'));
}
window.syncPortalAvailabilityFromBookings=()=>reconcileAll('مزامنة مباشرة');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();