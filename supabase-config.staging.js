(()=>{
'use strict';

const STAGING_PROJECT_REF='ztqqdjryvecscidxxbfe';
const PRODUCTION_PROJECT_REF='pgdvlklpyrvmwzitsmbw';
const STAGING_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const PRODUCTION_PUBLISHABLE_KEY='sb_publishable_BFTIR_8VK2qQuKnl2c-jDA_cMnWz0E-';
const PRODUCTION_GITHUB_HOST='asm114.github.io';
const PRODUCTION_GITHUB_PATH='/adwaa-alsharq';
const PRODUCTION_VERCEL_HOST='adwaa-alsharq.vercel.app';
const BOOKING_SAVE_VERSION='20260916-3';
const hostname=String(window.location?.hostname||'').toLowerCase();
const pathname=String(window.location?.pathname||'');
const isProductionGithubPages=hostname===PRODUCTION_GITHUB_HOST&&(
  pathname===PRODUCTION_GITHUB_PATH||pathname.startsWith(`${PRODUCTION_GITHUB_PATH}/`)
);
const isProductionVercel=hostname===PRODUCTION_VERCEL_HOST;
const runtimeEnvironment=(isProductionGithubPages||isProductionVercel)?'production':'staging';

function projectRefFromUrl(value){
  const hostname=new URL(String(value||'')).hostname.toLowerCase();
  return hostname.endsWith('.supabase.co')?hostname.slice(0,-'.supabase.co'.length):'';
}

function validateStagingSupabaseConfig(config){
  if(config?.environment!=='staging')throw new Error('إعداد Supabase غير مخصص لطبقة التهيئة المعتمدة.');
  const projectRef=projectRefFromUrl(config.url);
  if(runtimeEnvironment==='production'){
    if(projectRef!==PRODUCTION_PROJECT_REF)throw new Error(`تم منع Production من الاتصال بمشروع Supabase غير معتمد: ${projectRef||'غير معروف'}`);
  }else{
    if(projectRef===PRODUCTION_PROJECT_REF)throw new Error('تم منع تشغيل Staging على مشروع Supabase الخاص بـProduction.');
    if(projectRef!==STAGING_PROJECT_REF)throw new Error(`Project Ref غير معتمد لبيئة Staging: ${projectRef||'غير معروف'}`);
  }
  if(!String(config.publishableKey||'').startsWith('sb_publishable_'))throw new Error('مفتاح Supabase العام غير صالح أو مفقود.');
  return Object.freeze({...config,projectRef,runtimeEnvironment});
}

window.__adwaaValidateStagingSupabaseConfig=validateStagingSupabaseConfig;
const activeProjectRef=runtimeEnvironment==='production'?PRODUCTION_PROJECT_REF:STAGING_PROJECT_REF;
const activePublishableKey=runtimeEnvironment==='production'?PRODUCTION_PUBLISHABLE_KEY:STAGING_PUBLISHABLE_KEY;
window.ADWAA_SUPABASE_CONFIG=validateStagingSupabaseConfig({
  environment:'staging',
  url:`https://${activeProjectRef}.supabase.co`,
  publishableKey:activePublishableKey
});

if(runtimeEnvironment==='production'){
  window.__adwaaPortalAdminClientInstalled=true;
  window.__adwaaLegacyPortalAdminDisabled=true;
}

function showBookingSaveStatus(state,title,detail=''){
  const api=window.__adwaaBookingSaveStability;
  if(typeof api?.showStatus==='function'){
    api.showStatus(state,title,detail,state==='success'?4200:0);
    return;
  }
  if(typeof setSyncStatus==='function')setSyncStatus(`${title}${detail?` — ${detail}`:''}`,state==='success'?'ok':'error');
}

function bookingField(id){return document.getElementById(id)}
function cloneState(value){return JSON.parse(JSON.stringify(value))}
function formatSupabaseError(prefix,error){
  const message=String(error?.message||error||'خطأ غير معروف');
  const code=String(error?.code||'').trim();
  return new Error(`${prefix}: ${message}${code?` [${code}]`:''}`);
}

async function writeStateAndVerifyBooking(booking){
  const client=window.supabaseClient;
  if(!client)throw new Error('اتصال Supabase غير جاهز. سجّل الدخول من جديد ثم حاول الحفظ.');
  if(runtimeEnvironment==='production'&&window.ADWAA_SUPABASE_CONFIG?.projectRef!==PRODUCTION_PROJECT_REF){
    throw new Error('تم منع الحفظ لأن الموقع غير متصل بمشروع Production المعتمد.');
  }

  db=normalizeDB(db);
  const payload={data:db,updated_at:new Date().toISOString()};
  const updateResult=await client
    .from('app_state')
    .update(payload)
    .eq('id','main')
    .select('id')
    .maybeSingle();
  if(updateResult.error)throw formatSupabaseError('فشل UPDATE في Supabase',updateResult.error);

  if(!updateResult.data?.id){
    const upsertResult=await client
      .from('app_state')
      .upsert({id:'main',...payload})
      .select('id')
      .maybeSingle();
    if(upsertResult.error)throw formatSupabaseError('فشل UPSERT في Supabase',upsertResult.error);
    if(!upsertResult.data?.id)throw new Error('Supabase لم يؤكد كتابة سجل app_state.');
  }

  const verifyResult=await client
    .from('app_state')
    .select('data,updated_at')
    .eq('id','main')
    .maybeSingle();
  if(verifyResult.error)throw formatSupabaseError('فشل التحقق بعد الكتابة',verifyResult.error);
  const remoteRows=Array.isArray(verifyResult.data?.data?.bookings)?verifyResult.data.data.bookings:[];
  const remote=remoteRows.find(item=>String(item?.id||'')===String(booking.id)||String(item?.code||'')===String(booking.code));
  if(!remote)throw new Error(`تمت الكتابة لكن الحجز ${booking.code||booking.id} غير موجود في القراءة اللاحقة من Supabase.`);

  const fields=['code','date','type','status','recordType','updatedAt'];
  for(const field of fields){
    if(String(remote?.[field]??'')!==String(booking?.[field]??''))throw new Error(`الحقل ${field} لم يتطابق بعد الحفظ.`);
  }
  if(Math.abs(Number(remote.total||0)-Number(booking.total||0))>0.009)throw new Error('إجمالي الحجز لم يتطابق بعد الحفظ.');
  if(Math.abs(Number(remote.paid||0)-Number(booking.paid||0))>0.009)throw new Error('المدفوع لم يتطابق بعد الحفظ.');
  return remote;
}

async function saveBookingAuthoritatively(event){
  event.preventDefault();
  event.stopImmediatePropagation();
  if(window.__adwaaAuthoritativeBookingSaveBusy)return false;
  window.__adwaaAuthoritativeBookingSaveBusy=true;

  const originalState=cloneState(db);
  const originalFormId=String(bookingField('bId')?.value||'');
  const code=String(bookingField('bCode')?.value||'').trim();
  showBookingSaveStatus('saving','جاري حفظ الحجز مباشرة في Supabase…','لن تُغلق الشاشة حتى يتم تأكيد القراءة من قاعدة البيانات.');

  try{
    let id=String(bookingField('bId')?.value||'').trim();
    let oldBooking=id?db.bookings.find(x=>String(x.id)===id):null;
    if(!oldBooking&&!id&&code){
      const localByCode=db.bookings.find(x=>String(x.code||'')===code);
      if(localByCode){oldBooking=localByCode;id=String(localByCode.id||'')}
    }
    const previousStatus=oldBooking?.status||'';
    const selectedRecordType=bookingField('bRecordType')?.value||oldBooking?.recordType||'customer';
    let obj={
      ...(oldBooking||{}),
      id:id||crypto.randomUUID(),
      code,
      name:selectedRecordType==='family'?'تواجد العائلة':String(bookingField('bName')?.value||'').trim(),
      phone:selectedRecordType==='family'?'':String(bookingField('bPhone')?.value||'').trim(),
      date:String(bookingField('bDate')?.value||''),
      type:String(bookingField('bType')?.value||''),
      stayDays:String(bookingField('bType')?.value||'')==='مبيت'?Math.max(1,Number(bookingField('bStayDays')?.value||1)):1,
      paid:selectedRecordType==='family'?0:Number(bookingField('bPaid')?.value||0),
      total:selectedRecordType==='family'?0:Number(bookingField('bTotal')?.value||0),
      status:String(bookingField('bStatus')?.value||''),
      notes:String(bookingField('bNotes')?.value||'').trim(),
      photos:typeof editingBookingPhotos!=='undefined'?editingBookingPhotos:[],
      recordType:selectedRecordType,
      createdAt:oldBooking?.createdAt||new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    obj=normalizeBookingCommission(obj,db.settings);

    if(oldBooking?.commissionSnapshot?.status==='received'&&obj.status==='ملغي'){
      alert('تنبيه: عمولة هذا الحجز مستلمة بالفعل. بقي سجلها محفوظًا ويجب على المدير مراجعته يدويًا.');
    }

    const conflict=findBookingConflict(obj,obj.id);
    if(conflict){
      const alt=nextAvailableDate(obj.date);
      throw new Error(`يوجد تعارض مع حجز ${conflict.name} خلال فترة الحجز المطلوبة.${alt?` أقرب تاريخ متاح مبدئيًا: ${alt}`:''}`);
    }

    if(oldBooking){
      const index=db.bookings.findIndex(x=>String(x.id)===String(oldBooking.id));
      if(index<0)throw new Error('تعذر تحديد الحجز المراد تعديله داخل البيانات المحلية.');
      db.bookings[index]=obj;
      addAudit('تعديل','حجز',`${obj.name} — #${obj.code}`,oldBooking,obj);
    }else{
      db.bookings.push(obj);
      db.seq++;
      addAudit('إضافة','حجز',`${obj.name} — #${obj.code}`,null,obj);
    }

    invalidateCaches();
    ensureCleaningTaskForBooking(obj,previousStatus);
    const remote=await writeStateAndVerifyBooking(obj);

    try{localStorage.setItem('adwaaDB',JSON.stringify(db))}catch(storageErr){console.warn('تعذر حفظ النسخة المحلية',storageErr)}
    remoteReady=true;
    lastSuccessfulWriteAt=new Date().toISOString();
    lastSuccessfulReadAt=lastSuccessfulWriteAt;
    lastSyncError='';
    await markRemoteStateConfirmed(db);
    scheduleRenderAll();
    setSyncStatus('تم الحفظ والمزامنة','ok');
    const idInput=bookingField('bId');if(idInput)idInput.value=String(remote.id||obj.id);
    window.__adwaaLastBookingSaveConfirmed={ok:true,id:obj.id,code:obj.code,mode:'authoritative-submit',version:BOOKING_SAVE_VERSION,at:new Date().toISOString()};
    showBookingSaveStatus('success','تم حفظ الحجز في Supabase','تمت الكتابة ثم إعادة القراءة والتأكد من الحجز بنجاح.');
    closeModal('bookingModal');
    return true;
  }catch(error){
    db=normalizeDB(originalState);
    invalidateCaches();
    try{localStorage.setItem('adwaaDB',JSON.stringify(db))}catch(_){}
    scheduleRenderAll();
    const idInput=bookingField('bId');if(idInput)idInput.value=originalFormId;
    remoteReady=false;
    lastSyncError=String(error?.message||error||'تعذر حفظ الحجز');
    setSyncStatus('فشل حفظ الحجز في Supabase','error');
    window.__adwaaLastBookingSaveConfirmed={ok:false,code,error:lastSyncError,mode:'authoritative-submit',version:BOOKING_SAVE_VERSION,at:new Date().toISOString()};
    showBookingSaveStatus('error','فشل الحفظ المباشر في Supabase',lastSyncError);
    console.error('Authoritative booking save failed:',error);
    document.getElementById('bookingModal')?.classList.add('open');
    document.body.classList.add('modal-open');
    return false;
  }finally{
    window.__adwaaAuthoritativeBookingSaveBusy=false;
  }
}

function installAuthoritativeBookingSubmit(){
  if(window.__adwaaAuthoritativeBookingSubmitInstalled===BOOKING_SAVE_VERSION)return;
  window.__adwaaAuthoritativeBookingSubmitInstalled=BOOKING_SAVE_VERSION;
  document.addEventListener('submit',event=>{
    if(event.target?.id!=='bookingForm')return;
    void saveBookingAuthoritatively(event);
  },true);
}

function loadBookingSupport(){
  if(window.__adwaaBookingSaveHotfixLoaderStartedV3)return Promise.resolve();
  window.__adwaaBookingSaveHotfixLoaderStartedV3=true;
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`booking-save-stability.js?v=${BOOKING_SAVE_VERSION}`;
    script.async=false;
    script.onload=resolve;
    script.onerror=()=>reject(new Error('تعذر تحميل أدوات واجهة حفظ الحجز.'));
    document.head.appendChild(script);
  });
}

function bootBookingSave(){
  loadBookingSupport()
    .catch(error=>console.error(error))
    .finally(installAuthoritativeBookingSubmit);
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootBookingSave,{once:true});
  else bootBookingSave();
}
})();