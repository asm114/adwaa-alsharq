(()=>{
'use strict';
if(window.__adwaaBookingPersistUpdatePathInstalled)return;
window.__adwaaBookingPersistUpdatePathInstalled=true;

function install(){
  const current=window.persist;
  if(typeof current!=='function'||current.__adwaaUpdatePath)return false;

  // Serialize snapshots: a later save must not overtake an earlier request.
  let saveQueue=Promise.resolve();
  let needsReconciliation=false;
  const equivalent=(a,b)=>{
    const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
    return JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
  };
  async function readMatches(snapshot){
    const result=await supabaseClient.from('app_state').select('data').eq('id',STATE_ROW_ID).maybeSingle();
    if(result.error)throw result.error;
    return !!result.data&&equivalent(result.data.data,snapshot);
  }
  async function saveSnapshot(snapshot){
    let mode='update';
    // An indeterminate write is read before any subsequent write. Never retry it blindly.
    if(needsReconciliation){
      // Reconcile the data being retried, including its existing operation IDs.
      // If reading fails, stop; a second blind write is unsafe.
      if(await readMatches(snapshot)){needsReconciliation=false;return 'reconciled'}
      needsReconciliation=false;
    }
    const payload={data:snapshot,updated_at:new Date().toISOString()};
    try{
      const updateResult=await supabaseClient.from('app_state').update(payload).eq('id',STATE_ROW_ID).select('id').maybeSingle();
      if(updateResult.error)throw updateResult.error;
      if(!updateResult.data?.id){
        const insertResult=await supabaseClient.from('app_state').upsert({id:STATE_ROW_ID,...payload}).select('id').maybeSingle();
        if(insertResult.error)throw insertResult.error;
        if(!insertResult.data?.id)throw new Error('لم يؤكد Supabase إنشاء سجل النظام.');
        mode='upsert';
      }
      return mode;
    }catch(error){
      try{if(await readMatches(snapshot))return 'reconciled'}catch(_){}
      // Require a read before another attempt; the caller retains the operation IDs.
      needsReconciliation=true;
      throw error;
    }
  }
  const robustPersist=function(){
    const snapshot=JSON.parse(JSON.stringify(normalizeDB(db)));
    const operation=saveQueue.then(()=>performSave(snapshot));
    saveQueue=operation.catch(()=>{});
    return operation;
  };
  async function performSave(snapshot){
    if(!currentUser){alert('انتهت جلسة الدخول. سجّل الدخول من جديد.');showLogin();return false}
    db=normalizeDB(db);
    invalidateCaches();
    try{localStorage.setItem('adwaaDB',JSON.stringify(db))}catch(storageErr){console.warn('تعذر حفظ النسخة المحلية',storageErr)}
    scheduleRenderAll();

    try{
      const mode=await saveSnapshot(snapshot);

      remoteReady=true;
      lastSuccessfulWriteAt=new Date().toISOString();lastSyncError='';
      // Database acknowledgement is authoritative. Hash/UI failures cannot undo it.
      try{Promise.resolve(markRemoteStateConfirmed(snapshot)).catch(()=>{lastConfirmedRemoteHash=''})}catch(_){lastConfirmedRemoteHash=''}
      try{setSyncStatus('تم الحفظ في قاعدة البيانات','ok')}catch(_){}
      window.__adwaaLastPersistResult={ok:true,at:lastSuccessfulWriteAt,mode};
      return true;
    }catch(err){
      console.error(err);
      remoteReady=false;
      lastSyncError=String(err?.message||err||'تعذر حفظ البيانات في قاعدة البيانات');
      window.__adwaaLastPersistResult={ok:false,outcome:'unknown',error:lastSyncError,at:new Date().toISOString()};
      try{Promise.resolve(renderDataProtectionSyncStatus()).catch(()=>{})}catch(_){}
      try{setSyncStatus('لم يتأكد الحفظ؛ احتفظ بالمدخلات وتحقق من السجل قبل إعادة المحاولة','error')}catch(_){}
      throw err;
    }
  };
  robustPersist.__adwaaUpdatePath=true;
  robustPersist.__base=current;
  window.persist=robustPersist;
  try{persist=robustPersist}catch(_){}
  return true;
}

if(!install()){
  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>=20)clearInterval(timer)},250);
}
})();
