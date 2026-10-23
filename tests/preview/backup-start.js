'use strict';
// These overrides are preview-only. All application persistence uses the shipped
// CAS service over the synthetic SDK; no network client exists for Supabase.
supabaseClient=window.supabase.createClient('https://isolated.invalid','synthetic');
function renderDataProtectionCenter(){renderGoogleDriveStatus();void renderBackupManagement()}
function previewImportBlocked(){setBackupOperationMessage('استيراد بيانات أو ملفات حقيقية معطل في هذه المعاينة.','error')}
importData=previewImportBlocked;restoreStoredBackup=previewImportBlocked;inspectProtectionBackupFile=previewImportBlocked;
if(!PREVIEW_LIVE){
  // An OAuth test double, never a real access token.
  window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'synthetic-drive-token',expires_in:3600})})}}};
}else{
  // The synthetic SDK blocked fetch on boot. Recover only native Google transport.
  // Assigned by bootstrap before that SDK loads; no Supabase URL is permitted.
  window.fetch=async(url,options={})=>{
    const u=new URL(url);
    if(u.protocol!=='https:'||u.hostname!=='www.googleapis.com'||!/^\/(?:upload\/)?drive\/v3\//.test(u.pathname))throw new Error('حُجب اتصال خارج Google Drive في المعاينة');
    try{const response=await window.__previewNativeFetch(url,options);previewLog('Drive حي',String(response.status));return response}
    catch(error){previewLog('Drive حي','استجابة شبكة غير مؤكدة');throw error}
  };
}
async function startPreview(){
  const button=document.getElementById('previewStart'),status=document.getElementById('previewReady');button.disabled=true;
  try{
    const pass=document.getElementById('previewPassphrase').value;
    if(pass.length<12)throw new Error('أدخل عبارة اختبار من 12 حرفًا على الأقل. لا تستخدم كلمة مرور حقيقية.');
    if(AdwaaLocalVault.configured())await AdwaaLocalVault.unlock(pass);else await AdwaaLocalVault.create(pass);
    document.getElementById('previewPassphrase').value='';
    await AdwaaPersistence.ready;AdwaaPersistence.acceptRemote(await AdwaaPersistence.readRow());
    if(!PREVIEW_LIVE){saveGoogleDriveState({folderId:'synthetic-folder'});}
    document.getElementById('previewControls').hidden=false;
    status.textContent='جلسة اختبار جاهزة — بيانات مصطنعة فقط';
    renderDataProtectionCenter();
    if(PREVIEW_LIVE&&GOOGLE_DRIVE_CLIENT_ID==='PREVIEW_TEST_CLIENT_ID_REQUIRED'){document.getElementById('googleDriveConnectButton').disabled=true;setGoogleDriveMessage('Google الحي غير مفعّل: يحتاج المالك عميل OAuth تجريبيًا منفصلًا لهذا الأصل. لا تستخدم عميل الإنتاج.','')}
    previewLog('بدء الجلسة',PREVIEW_LIVE?'Drive الحقيقي متاح بعد OAuth المعتمد؛ Supabase وهمي':'كل الخدمات وهمية');
  }catch(error){status.textContent=error.message||'تعذر بدء المعاينة'}finally{button.disabled=false}
}
