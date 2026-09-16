(()=>{
'use strict';
if(window.__adwaaBookingPersistUpdatePathInstalled)return;
window.__adwaaBookingPersistUpdatePathInstalled=true;

function install(){
  const current=window.persist;
  if(typeof current!=='function'||current.__adwaaUpdatePath)return false;

  const robustPersist=async function(){
    if(!currentUser){alert('انتهت جلسة الدخول. سجّل الدخول من جديد.');showLogin();return false}
    db=normalizeDB(db);
    invalidateCaches();
    try{localStorage.setItem('adwaaDB',JSON.stringify(db))}catch(storageErr){console.warn('تعذر حفظ النسخة المحلية',storageErr)}
    scheduleRenderAll();

    try{
      const payload={data:db,updated_at:new Date().toISOString()};
      const updateResult=await supabaseClient
        .from('app_state')
        .update(payload)
        .eq('id',STATE_ROW_ID)
        .select('id')
        .maybeSingle();
      if(updateResult.error)throw updateResult.error;

      if(!updateResult.data?.id){
        const insertResult=await supabaseClient
          .from('app_state')
          .upsert({id:STATE_ROW_ID,...payload})
          .select('id')
          .maybeSingle();
        if(insertResult.error)throw insertResult.error;
        if(!insertResult.data?.id)throw new Error('لم يؤكد Supabase إنشاء سجل النظام.');
      }

      remoteReady=true;
      lastSuccessfulWriteAt=new Date().toISOString();lastSyncError='';
      await markRemoteStateConfirmed(db);
      setSyncStatus('تم الحفظ والمزامنة','ok');
      window.__adwaaLastPersistResult={ok:true,at:lastSuccessfulWriteAt,mode:updateResult.data?.id?'update':'upsert'};
      return true;
    }catch(err){
      console.error(err);
      remoteReady=false;
      lastSyncError=String(err?.message||err||'تعذر حفظ البيانات في قاعدة البيانات');
      window.__adwaaLastPersistResult={ok:false,error:lastSyncError,at:new Date().toISOString()};
      void renderDataProtectionSyncStatus();
      setSyncStatus('تعذر رفع آخر تعديل؛ محفوظ مؤقتًا على هذا الجهاز','error');
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
