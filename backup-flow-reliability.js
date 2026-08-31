(()=>{
'use strict';
if(window.__adwaaBackupFlowReliabilityInstalled)return;
window.__adwaaBackupFlowReliabilityInstalled=true;

let reliableBackupBusy=false;

function backupErrorText(error){
  return String(error?.message||error||'خطأ غير معروف').trim();
}

async function requestPersistentBackupStorage(){
  try{
    if(navigator.storage?.persist)await navigator.storage.persist();
  }catch(_){ }
}

async function verifyStoredBackupRecord(id){
  try{
    const record=await activeDataProtectionProvider().get(id);
    if(!record)return {ok:false,error:'لم يمكن قراءة النسخة من مخزن المتصفح بعد حفظها.'};
    const envelope=record.envelope||JSON.parse(record.json||'null');
    await verifyBackupPayload(envelope);
    return {ok:true,record};
  }catch(error){
    return {ok:false,error:backupErrorText(error)};
  }
}

async function persistBackupMetadata(){
  if(!currentUser)return {ok:false,error:'انتهت جلسة الدخول. النسخة المحلية لم تُحذف، لكن سجلها لم يُزامن.'};
  db=normalizeDB(db);
  invalidateCaches();
  try{localStorage.setItem('adwaaDB',JSON.stringify(db))}catch(error){console.warn('تعذر تحديث سجل النسخ في localStorage',error)}
  scheduleRenderAll();
  try{
    const {error}=await supabaseClient.from('app_state').upsert({id:STATE_ROW_ID,data:db,updated_at:new Date().toISOString()});
    if(error)throw error;
    remoteReady=true;
    lastSuccessfulWriteAt=new Date().toISOString();
    lastSyncError='';
    await markRemoteStateConfirmed(db);
    setSyncStatus('تم الحفظ والمزامنة','ok');
    return {ok:true,error:''};
  }catch(error){
    const message=backupErrorText(error);
    console.error('تعذر مزامنة سجل النسخة مع Supabase مع بقاء النسخة المحلية',error);
    remoteReady=false;
    lastSyncError=message;
    void renderDataProtectionSyncStatus();
    setSyncStatus('النسخة الاحتياطية محفوظة محليًا، لكن سجل النسخة لم يتزامن مع Supabase','warning');
    return {ok:false,error:message};
  }
}

async function createReliableBackup(type='يدوي',options={}){
  if(reliableBackupBusy)throw new Error('توجد عملية نسخ احتياطي جارية الآن. انتظر اكتمالها ثم أعد المحاولة.');
  reliableBackupBusy=true;
  try{
    const {downloadFile=true,silent=false,note='',preferDirectory=downloadFile}=options;
    let directoryRecord=null,directoryError='';
    if(preferDirectory){
      try{directoryRecord=await writableBackupDirectory()}
      catch(error){directoryError=backupErrorText(error)||'المسار المحدد غير صالح'}
    }

    const envelope=await createBackupEnvelope(type,note);
    const json=JSON.stringify(envelope,null,2);
    const checked=await verifyBackupPayload(JSON.parse(json));
    const size=new Blob([json]).size;
    const id=envelope.recoveryId;
    const fileName=backupFileName(type,new Date(envelope.createdAt),envelope.recoveryId);
    const vaultRecord={id,recoveryId:envelope.recoveryId,envelope,json,size,fileName};

    await requestPersistentBackupStorage();

    let stored=false,vaultError='';
    try{
      await activeDataProtectionProvider().save(vaultRecord);
      const verification=await verifyStoredBackupRecord(id);
      if(!verification.ok)throw new Error(verification.error||'فشل التحقق من النسخة المحلية بعد حفظها.');
      stored=true;
    }catch(error){
      vaultError=backupErrorText(error);
      console.error('تعذر حفظ نسخة قابلة للقراءة داخل مخزن المتصفح',error);
    }

    let location=stored?'مخزن المتصفح الآمن':'غير محفوظ في مخزن المتصفح';
    let fileSaved=false,downloadRequested=false;
    if(directoryRecord){
      try{
        await writeVerifiedBackupFile(directoryRecord,fileName,json);
        location=stored?`مخزن المتصفح الآمن + المجلد: ${directoryRecord.label||directoryRecord.handle.name}`:`المجلد: ${directoryRecord.label||directoryRecord.handle.name}`;
        fileSaved=true;
      }catch(error){directoryError=backupErrorText(error)||'تعذر الحفظ في المجلد المحدد'}
    }
    if(downloadFile&&!fileSaved){
      try{
        download(fileName,json,'application/json');
        downloadRequested=true;
        fileSaved=true;
        location=stored?'مخزن المتصفح الآمن + ملف تنزيل':'تم تجهيز ملف للتنزيل';
      }catch(error){
        directoryError=[directoryError,backupErrorText(error)].filter(Boolean).join(' — ');
      }
    }

    const rollbackReady=stored||fileSaved;
    if(!rollbackReady){
      const detail=[vaultError,directoryError].filter(Boolean).join(' — ');
      throw new Error(`لم ينجح حفظ نسخة قابلة للاستعادة${detail?`: ${detail}`:'.'}`);
    }

    db.backupHistory=Array.isArray(db.backupHistory)?db.backupHistory:[];
    db.backupHistory.unshift({
      id,recoveryId:envelope.recoveryId,createdAt:envelope.createdAt,size,
      user:envelope.createdBy,type,version:APP_VERSION,stored,fileName,location,
      providerId:DATA_PROTECTION_PROVIDER_ID,verified:true,status:'سليمة',
      relationshipWarnings:checked.relationships.warnings.length
    });
    addAudit('إنشاء','نسخة احتياطية',`${type} — Recovery ID: ${envelope.recoveryId} — ${formatBytes(size)} — تم فحص ${checked.summary.bookings} حجز${stored?'':' — الاعتماد على ملف التنزيل البديل'}`,null,{id,recoveryId:envelope.recoveryId,type,size,fileName,location,verified:true});

    const metadataSync=await persistBackupMetadata();

    let cloudResult={ok:false,skipped:true};
    try{cloudResult=await syncBackupToGoogleDrive(vaultRecord)}
    catch(error){cloudResult={ok:false,error:backupErrorText(error)}}

    if(!silent){
      const lines=[];
      if(stored)lines.push('✅ تم حفظ النسخة داخل مخزن المتصفح الآمن وتمت قراءتها وفحصها بعد الحفظ.');
      else if(downloadRequested)lines.push('🟡 تعذر تثبيت النسخة داخل مخزن المتصفح؛ تم تجهيز ملف تنزيل بديل. تأكد من ظهوره في ملفات الجهاز.');
      else lines.push(`✅ تم حفظ ملف النسخة في ${location}.`);
      lines.push(metadataSync.ok?'✅ تم تسجيل النسخة ومزامنة سجلها مع Supabase.':`🟡 النسخة نفسها سليمة، لكن تعذر مزامنة سجلها مع Supabase الآن: ${metadataSync.error}`);
      if(cloudResult?.ok)lines.push('✅ تم رفع نسخة إلى Google Drive والتحقق منها.');
      else if(!cloudResult?.skipped&&!cloudResult?.busy&&cloudResult?.error)lines.push(`🟡 Google Drive لم يكتمل: ${cloudResult.error}`);
      if(directoryError)lines.push(`ℹ️ ملاحظة الحفظ الخارجي: ${directoryError}`);
      const message=lines.join('\n');
      setBackupOperationMessage(message,metadataSync.ok&&stored?'success':'');
      alert(`نتيجة النسخ الاحتياطي:\n${message}\n\nاسم الملف: ${fileName}\nالحجم: ${formatBytes(size)}`);
    }

    try{renderBackupHistory();renderBackupManagement();renderDataProtectionCenter()}catch(error){console.warn('تم إنشاء النسخة وتعذر تحديث جزء من واجهة النسخ',error)}
    return {id,recoveryId:envelope.recoveryId,envelope,json,size,stored,fileSaved,downloadRequested,rollbackReady,fileName,location,verified:true,cloudResult,metadataSync};
  }finally{
    reliableBackupBusy=false;
  }
}

function showReliableBackupFailure(error){
  const message=backupErrorText(error);
  setBackupOperationMessage(`🔴 تعذر إنشاء نسخة احتياطية قابلة للاستعادة: ${message}`,'error');
  alert(`تعذر إنشاء النسخة الاحتياطية:\n${message}`);
}

try{createBackup=createReliableBackup}catch(_){ }
window.createBackup=createReliableBackup;

const manual=()=>createReliableBackup('يدوي',{downloadFile:true,preferDirectory:true}).catch(error=>{showReliableBackupFailure(error);return null});
const restorePoint=()=>createReliableBackup('نقطة استعادة',{downloadFile:true,note:'نقطة استعادة قبل تحديث أو تعديل كبير'}).catch(error=>{showReliableBackupFailure(error);return null});
try{createManualBackup=manual}catch(_){ }
try{createRestorePoint=restorePoint}catch(_){ }
window.createManualBackup=manual;
window.createRestorePoint=restorePoint;
})();
