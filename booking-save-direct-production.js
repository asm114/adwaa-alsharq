(()=>{
'use strict';
const VERSION='20260916-2';
if(window.__adwaaBookingDirectSaveVersion===VERSION)return;
window.__adwaaBookingDirectSaveVersion=VERSION;
let saveBusy=false;

function getClient(){
  try{if(typeof supabaseClient!=='undefined'&&supabaseClient)return supabaseClient}catch(_){}
  return window.supabaseClient||null;
}
function getState(){
  try{if(typeof db!=='undefined'&&db)return db}catch(_){}
  return window.db||null;
}
function getRowId(){
  try{if(typeof STATE_ROW_ID!=='undefined'&&STATE_ROW_ID)return STATE_ROW_ID}catch(_){}
  return 'main';
}
function errorWithContext(prefix,error){
  const message=String(error?.message||error||'خطأ غير معروف');
  const code=String(error?.code||'').trim();
  return new Error(`${prefix}: ${message}${code?` [${code}]`:''}`);
}
function showStatus(state,title,detail){
  const api=window.__adwaaBookingSaveStability;
  if(typeof api?.showStatus==='function')api.showStatus(state,title,detail,state==='success'?4200:0);
  else console[state==='error'?'error':'log'](`${title}: ${detail}`);
}

async function directPersist(){
  const client=getClient();
  const state=getState();
  const rowId=getRowId();
  if(!client)throw new Error('تعذر الوصول إلى اتصال Supabase أثناء الحفظ المباشر.');
  if(!state||!Array.isArray(state.bookings))throw new Error('تعذر قراءة بيانات الحجز المحلية قبل رفعها إلى Supabase.');

  const payload={data:state,updated_at:new Date().toISOString()};
  const updateResult=await client
    .from('app_state')
    .update(payload)
    .eq('id',rowId)
    .select('id')
    .maybeSingle();
  if(updateResult.error)throw errorWithContext('فشل UPDATE المباشر في Supabase',updateResult.error);

  if(!updateResult.data?.id){
    const upsertResult=await client
      .from('app_state')
      .upsert({id:rowId,...payload})
      .select('id')
      .maybeSingle();
    if(upsertResult.error)throw errorWithContext('فشل UPSERT الاحتياطي في Supabase',upsertResult.error);
    if(!upsertResult.data?.id)throw new Error('Supabase لم يؤكد كتابة سجل app_state بعد الحفظ المباشر.');
  }

  window.__adwaaLastPersistResult={ok:true,mode:updateResult.data?.id?'direct-update':'direct-upsert',at:new Date().toISOString()};
  return true;
}

async function verifyRemoteBooking(id,code){
  const client=getClient();
  const rowId=getRowId();
  if(!client)throw new Error('تعذر الوصول إلى اتصال Supabase أثناء تأكيد الحجز.');
  const result=await client.from('app_state').select('data,updated_at').eq('id',rowId).maybeSingle();
  if(result.error)throw errorWithContext('فشل قراءة Supabase بعد الحفظ',result.error);
  const rows=Array.isArray(result.data?.data?.bookings)?result.data.data.bookings:[];
  const remote=rows.find(item=>(id&&String(item?.id||'')===String(id))||(code&&String(item?.code||'')===String(code)));
  if(!remote)throw new Error(`تمت محاولة الكتابة المباشرة لكن الحجز ${code||id||''} لم يظهر في Supabase. عدد الحجوزات البعيدة: ${rows.length}.`);
  return remote;
}

function findLocalBooking(beforeIds,code){
  const state=getState();
  const rows=Array.isArray(state?.bookings)?state.bookings:[];
  return rows.find(row=>code&&String(row?.code||'')===code)||rows.find(row=>row?.id&&!beforeIds.has(String(row.id)))||null;
}

function install(){
  const current=window.saveBooking;
  if(typeof current!=='function')return false;
  if(current.__adwaaBookingDirectSaveVersion===VERSION)return true;

  const base=current.__bookingSaveStabilityWrapped&&typeof current.__base==='function'?current.__base:current;
  const wrapped=async function(event){
    if(saveBusy){event?.preventDefault?.();return false}
    const beforeIds=new Set((getState()?.bookings||[]).map(row=>String(row?.id||'')));
    const code=String(document.getElementById('bCode')?.value||'').trim();
    saveBusy=true;

    let originalWindowPersist=window.persist;
    let originalLexicalPersist=null;
    let lexicalPatched=false;
    try{
      try{
        if(typeof persist==='function'){
          originalLexicalPersist=persist;
          persist=directPersist;
          lexicalPatched=true;
        }
      }catch(_){}
      window.persist=directPersist;

      const result=await base.apply(this,arguments);
      const local=findLocalBooking(beforeIds,code);
      if(!local)return result;

      // نفّذ كتابة مباشرة ثانية للتأكد حتى لو كان المسار القديم قد ابتلع خطأه داخليًا.
      await directPersist();
      const remote=await verifyRemoteBooking(local.id,local.code||code);
      window.__adwaaLastBookingSaveConfirmed={ok:true,id:remote.id||local.id,code:remote.code||code,mode:'direct-production',at:new Date().toISOString()};
      showStatus('success','تم حفظ الحجز بنجاح','تمت كتابة الحجز مباشرة في Supabase ثم قراءته مرة أخرى وتأكيده.');
      return result;
    }catch(error){
      const local=findLocalBooking(beforeIds,code);
      const message=String(error?.message||error||'تعذر حفظ الحجز');
      window.__adwaaLastPersistResult={ok:false,error:message,at:new Date().toISOString()};
      window.__adwaaLastBookingSaveConfirmed={ok:false,id:local?.id||'',code:local?.code||code,error:message,mode:'direct-production',at:new Date().toISOString()};
      document.getElementById('bookingModal')?.classList.add('open');
      document.body.classList.add('modal-open');
      showStatus('error','لم يتم حفظ الحجز في Supabase',message);
      console.error('Direct production booking save:',error);
      return false;
    }finally{
      window.persist=originalWindowPersist;
      if(lexicalPatched){try{persist=originalLexicalPersist}catch(_){}}
      saveBusy=false;
    }
  };

  wrapped.__adwaaBookingDirectSaveVersion=VERSION;
  wrapped.__bookingSaveStabilityWrapped=true;
  wrapped.__base=base;
  if(current.__depositRefundPolicyWrapped||base.__depositRefundPolicyWrapped)wrapped.__depositRefundPolicyWrapped=true;
  window.saveBooking=wrapped;
  try{saveBooking=wrapped}catch(_){}
  return true;
}

if(!install()){
  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>=40)clearInterval(timer)},250);
}
})();
