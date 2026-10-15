(()=>{
'use strict';
if(window.__adwaaPortalBookingSyncStableInstalled)return;
window.__adwaaPortalBookingSyncStableInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const MAP_KEY='portalUnavailablePeriodIds';
const SOURCE_BOOKING='booking';
const CORE_SYNC_ALERT='تعذر مزامنة آخر تعديل';
let syncQueue=Promise.resolve();
let bookingSaveInFlight=false;
let bookingDeleteInFlight=false;
const pendingDeletes=new Map();

const state=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const activeBooking=booking=>booking&&!['ملغي','مؤجل'].includes(booking.status)&&booking.date;

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
function riyadhToday(){
  const override=String(window.__portalSyncToday||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(override))return override;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=type=>parts.find(part=>part.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function syncableDates(booking,today=riyadhToday()){
  return occupiedDates(booking).filter(date=>date>=today);
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
  if(type==='error'){console.warn(message);try{window.setSyncStatus?.(message,'error')}catch(_){}}
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
      .booking-save-toast{position:fixed;z-index:12000;right:14px;bottom:calc(18px + env(safe-area-inset-bottom));max-width:min(420px,calc(100vw - 28px));padding:12px 14px;border-radius:14px;box-shadow:0 14px 38px rgba(0,0,0,.18);font-size:13px;font-weight:800;line-height:1.65;background:#173f36;color:#fff;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s ease}.booking-save-toast.show{opacity:1;transform:none;pointer-events:auto}.booking-save-toast.error{background:#9f3939}.booking-save-toast.warning{background:#8a681c}
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
  if(type==='warning'){
    const retry=document.createElement('button');retry.type='button';retry.textContent='إعادة مزامنة البوابة';
    retry.addEventListener('click',async()=>{retry.disabled=true;try{if(await reconcileAll('إعادة المحاولة'))showBookingToast('تمت مزامنة بوابة العملاء ✓','success')}finally{retry.disabled=false}});
    toast.appendChild(retry);
  }
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
    if(typeof window.ensurePortalAdminSession==='function')return await window.ensurePortalAdminSession()===true?client:null;
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
  if(!Array.isArray(data))throw new Error('استجابة إغلاقات البوابة غير مكتملة.');
  return data;
}
function periodCoversDate(period,date){return !!period&&date>=period.start_date&&date<=period.end_date}
function periodOwnedByBooking(period,bookingId,date){
  return !!period&&period.source_type===SOURCE_BOOKING&&String(period.booking_id||'')===String(bookingId||'')&&periodCoversDate(period,date);
}
function ownedPeriodForDate(periods,bookingId,date){return periods.find(period=>periodOwnedByBooking(period,bookingId,date))||null}
async function createPeriod(client,date,bookingId){
  const owner=String(bookingId||'').trim();
  if(!owner)throw new Error('تعذر إنشاء إغلاق الحجز بدون معرف ملكية.');
  const {data,error}=await client.from(TABLE).insert({start_date:date,end_date:date,source_type:SOURCE_BOOKING,booking_id:owner}).select('id,start_date,end_date,source_type,booking_id').single();
  if(error)throw error;
  return data||null;
}
async function deletePeriod(client,id,bookingId){
  const owner=String(bookingId||'').trim();
  if(!id||!owner)throw new Error('تعذر حذف إغلاق بدون ملكية مؤكدة.');
  let query=client.from(TABLE).delete().eq('id',id).eq('source_type',SOURCE_BOOKING);
  query=query.eq('booking_id',owner);
  const {error}=await query;
  if(error)throw error;
}
// Read the confirmed source, never infer deletion from an incomplete local cache.
async function confirmedBookings(){
  const client=window.supabaseClient;
  if(!client)throw new Error('اتصال قاعدة الإدارة غير متاح.');
  const rowId=typeof STATE_ROW_ID!=='undefined'?STATE_ROW_ID:'main';
  const {data,error}=await client.from('app_state').select('data').eq('id',rowId).maybeSingle();
  if(error)throw error;
  const bookings=data?.data?.bookings;
  if(!Array.isArray(bookings))throw new Error('تعذر تأكيد قائمة الحجوزات من قاعدة الإدارة.');
  const ids=new Set();
  for(const booking of bookings){
    if(!booking?.id||ids.has(String(booking.id)))throw new Error('قائمة الحجوزات غير مكتملة أو تحتوي معرفات مكررة.');
    ids.add(String(booking.id));
    if(activeBooking(booking)&&(!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)||!Number.isInteger(Number(booking.stayDays||1))||Number(booking.stayDays||1)<1))throw new Error('تعذر تأكيد تواريخ أحد السجلات.');
  }
  return bookings;
}
function savePendingDeletes(){
  try{localStorage.setItem('adwaaPortalPendingDeletesV1',JSON.stringify([...pendingDeletes.keys()]))}catch(_){}
}
function availabilityKey(booking){return JSON.stringify([booking?.id,booking?.date,booking?.type,booking?.stayDays,booking?.status])}
async function transferPeriod(client,period,owner){
  const {data,error}=await client.from(TABLE).update({booking_id:owner})
    .eq('id',period.id).eq('source_type',SOURCE_BOOKING).eq('booking_id',period.booking_id)
    .select('id,start_date,end_date,source_type,booking_id').single();
  if(error)throw error;
  if(!data)throw new Error('لم تؤكد البوابة نقل ملكية الإغلاق.');
  return data;
}
async function runReconcile(reason){
  try{
    if(!coreStateIsSynced())throw new Error('آخر تعديل في الإدارة لم يُحفظ في قاعدة البيانات بعد.');
    const bookings=await confirmedBookings();
    const client=await resolvePortalAdminClient();
    if(!client)throw new Error(window.portalAdminAuthState?.error||'جلسة مدير بوابة العملاء غير متاحة');
    let periods=await loadPeriods(client);
    const today=riyadhToday();
    const desiredByBooking=new Map(bookings.map(booking=>[String(booking.id),new Set(syncableDates(booking,today))]));
    const ownersByDate=new Map();
    for(const [id,dates] of desiredByBooking)for(const date of dates){
      if(!ownersByDate.has(date))ownersByDate.set(date,[]);
      ownersByDate.get(date).push(id);
    }

    // Secure ALL new days before releasing any old day. The database's overlap
    // constraint remains the arbiter for racing inserts; re-read on conflict.
    for(const [date,owners] of ownersByDate){
      if(periods.some(period=>periodCoversDate(period,date)))continue;
      try{
        const created=await createPeriod(client,date,owners[0]);
        if(!created)throw new Error('لم تؤكد البوابة إنشاء الإغلاق.');
        periods.push(created);
      }catch(error){
        periods=await loadPeriods(client);
        if(!periods.some(period=>periodCoversDate(period,date)))throw error;
      }
    }

    // Only confirmed owners, or an explicitly captured UI deletion, may release
    // their rows. Unknown/orphan rows and manual/legacy periods are preserved.
    const sourceKey=rows=>JSON.stringify(rows.map(availabilityKey).sort());
    const confirmedKey=sourceKey(bookings);
    const released=new Set();
    let cleaned=0;
    for(const period of [...periods]){
      const owner=String(period.booking_id||'');
      if(period.source_type!==SOURCE_BOOKING||!owner||period.end_date<today)continue;
      if(!desiredByBooking.has(owner)&&!pendingDeletes.has(owner))continue;
      const desired=desiredByBooking.get(owner)||new Set();
      if([...desired].some(date=>periodCoversDate(period,date)))continue;
      const needed=[...ownersByDate.keys()].filter(date=>periodCoversDate(period,date));
      if(sourceKey(await confirmedBookings())!==confirmedKey)throw new Error('تغيرت حجوزات الإدارة أثناء المزامنة. بقيت الإغلاقات القديمة للحماية؛ أعد المحاولة.');
      if(needed.length){
        // Handoff keeps a shared day closed without a delete/insert gap.
        if(period.start_date!==period.end_date)continue;
        const next=await transferPeriod(client,period,ownersByDate.get(needed[0])[0]);
        periods=periods.map(row=>row.id===period.id?next:row);
      }else{
        await deletePeriod(client,period.id,owner);
        periods=periods.filter(row=>row.id!==period.id);
        released.add(period.id);
        cleaned++;
      }
    }
    periods=await loadPeriods(client);
    if(periods.some(period=>released.has(period.id)))throw new Error('لم تؤكد البوابة إزالة الإغلاق المملوك.');
    for(const date of ownersByDate.keys())if(!periods.some(period=>periodCoversDate(period,date)))throw new Error('تعذر تأكيد إغلاق جميع الأيام المشغولة.');
    for(const id of [...pendingDeletes.keys()]){
      if(!bookings.some(booking=>String(booking.id)===id)&&!periods.some(period=>period.source_type===SOURCE_BOOKING&&String(period.booking_id)===id&&period.end_date>=today))pendingDeletes.delete(id);
    }
    savePendingDeletes();
    const conflicts=[];
    for(const [date,owners] of ownersByDate)if(owners.length>1)conflicts.push({date,bookingIds:owners});
    for(const booking of bookings){
      const oldMap=mappingOf(booking);
      const nextMap=Object.fromEntries(Object.entries(oldMap).filter(([date])=>date<today));
      for(const date of desiredByBooking.get(String(booking.id))){
        const owned=ownedPeriodForDate(periods,booking.id,date);
        if(owned)nextMap[date]=owned.id;
        else{
          const conflict=periods.find(period=>periodCoversDate(period,date));
          conflicts.push({bookingId:String(booking.id),date,periodId:conflict?.id,sourceType:conflict?.source_type});
        }
      }
      const local=(state()?.bookings||[]).find(item=>availabilityKey(item)===availabilityKey(booking));
      // Ownership in the portal is canonical. Mapping is a local cache only;
      // synchronization never rewrites the administrative/financial state.
      if(local&&!sameMap(mappingOf(local),nextMap))local[MAP_KEY]=nextMap;
    }
    window.portalBookingSyncLastResult={ok:conflicts.length===0,reason,conflicts,cleanedBookingPeriods:cleaned};
    if(conflicts.length)throw new Error(`الأيام المشغولة مغلقة، مع وجود ${conflicts.length} تعارض يحتاج مراجعة. لم يتم تغيير الإغلاقات اليدوية أو القديمة.`);
    report(`تمت مزامنة توفر بوابة العملاء (${reason}).`,'success');
    try{window.setSyncStatus?.('تم تأكيد توفر بوابة العملاء','ok')}catch(_){}
    return true;
  }catch(error){
    const message=String(error?.message||error||'خطأ غير معروف');
    window.portalBookingSyncLastResult={...window.portalBookingSyncLastResult,ok:false,reason,error:message};
    report(`فشلت مزامنة بوابة العملاء: ${message}`,'error');
    showBookingToast(`لم تكتمل مزامنة بوابة العملاء: ${message}`,'warning',8000);
    return false;
  }
}
function reconcileAll(reason='auto'){
  // Serialize callers; each receives the outcome of its own fresh source read.
  const task=syncQueue.then(()=>runReconcile(reason));
  syncQueue=task.catch(()=>false);
  return task;
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
      const writeBefore=coreWriteState();
      try{
        const {result}=await withCapturedCoreSyncAlert(()=>save.apply(this,args));
        const savedBooking=beforeBooking?(state()?.bookings||[]).find(item=>item.id===beforeBooking.id)||null:bookingByCode(codeBefore);
        const changed=beforeBooking?!!savedBooking&&fingerprint(savedBooking)!==beforeFingerprint:!!savedBooking;
        if(!changed){clearBookingProgress();return result}
        if(!coreWriteSucceeded(writeBefore)){
          showBookingToast('تعذر رفع الحجز للسحابة. لم ننشئ حجزًا ثانيًا؛ افتحنا نفس الحجز لإعادة المحاولة.','error',5200);
          reopenFailedBooking(savedBooking);
          return result;
        }
        setBookingProgress('تم حفظ الإدارة، جارٍ تأكيد توفر بوابة العملاء...','loading');
        const synced=await reconcileAll(beforeBooking?'تعديل حجز':'حفظ حجز');
        if(synced){setBookingProgress('تم حفظ الحجز ومزامنة بوابة العملاء.','success');showBookingToast('تم حفظ الحجز ومزامنة البوابة ✓','success',2600)}
        else setBookingProgress('تم الحفظ في الإدارة، لكن مزامنة البوابة فشلت. أعد المزامنة بعد عودة الاتصال.','warning');
        return result;
      }finally{
        bookingSaveInFlight=false;setBusyButton(button,false);clearBookingProgress(2200);
      }
    };
    wrapped.__portalStableSyncWrapped=true;wrapped.__base=save;
    try{saveBooking=wrapped}catch(_){}
    window.saveBooking=wrapped;
  }

  const changeStatus=window.v95SetBookingStatus;
  if(typeof changeStatus==='function'&&!changeStatus.__portalStableSyncWrapped){
    const wrapped=async function(...args){
      const before=coreWriteState();
      const result=await changeStatus.apply(this,args);
      if(coreWriteSucceeded(before))await reconcileAll('تعديل حالة حجز');
      return result;
    };
    wrapped.__portalStableSyncWrapped=true;
    window.v95SetBookingStatus=wrapped;
  }

  const remove=window.deleteBooking;
  if(typeof remove==='function'&&!remove.__portalStableSyncWrapped){
    const wrapped=async function(...args){
      if(bookingDeleteInFlight)return false;
      bookingDeleteInFlight=true;
      const beforeBooking=currentBooking();
      const button=deleteButton();setBusyButton(button,true,'جاري الحذف...');
      if(beforeBooking){pendingDeletes.set(String(beforeBooking.id),mappingOf(beforeBooking));savePendingDeletes()}
      const writeBefore=coreWriteState();
      try{
        const {result}=await withCapturedCoreSyncAlert(()=>remove.apply(this,args));
        if(!beforeBooking)return result;
        const stillExists=(state()?.bookings||[]).some(booking=>booking.id===beforeBooking.id);
        if(stillExists){pendingDeletes.delete(String(beforeBooking.id));savePendingDeletes();return result}
        if(!coreWriteSucceeded(writeBefore)){
          showBookingToast('تم الحذف على هذا الجهاز فقط وتعذر رفعه للسحابة. لا تُعد المحاولة الآن قبل عودة الاتصال.','error',5200);
          return result;
        }
        const synced=await reconcileAll('حذف حجز');
        if(synced)showBookingToast('تم حذف الحجز ومزامنة البوابة ✓','success',2600);
        return result;
      }finally{bookingDeleteInFlight=false;setBusyButton(button,false,'جاري الحذف...')}
    };
    wrapped.__portalStableSyncWrapped=true;wrapped.__base=remove;
    try{deleteBooking=wrapped}catch(_){}
    window.deleteBooking=wrapped;
  }
}
function initialize(){
  try{const ids=JSON.parse(localStorage.getItem('adwaaPortalPendingDeletesV1')||'[]');if(Array.isArray(ids))for(const id of ids)if(typeof id==='string'&&id)pendingDeletes.set(id,{})}catch(_){}
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

