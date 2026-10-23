(()=>{
'use strict';
if(window.__adwaaBookingPersistUpdatePathInstalled)return;
window.__adwaaBookingPersistUpdatePathInstalled=true;

let generation=0;const controllers=new Set();
// Abort alone is insufficient: some transports never settle after abort.
function request(build,timeoutMs=12000){
  const controller=new AbortController();controllers.add(controller);let timer;
  const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason||Object.assign(new Error('انتهت الجلسة.'),{code:'ADWAA_SESSION_CLOSED'})),{once:true}));
  const work=Promise.resolve().then(()=>{if(controller.signal.aborted)throw controller.signal.reason;return build(controller.signal)});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
    const error=Object.assign(new Error('انتهت مهلة الاتصال؛ تحقق من نتيجة العملية.'),{code:'ADWAA_SAVE_TIMEOUT',outcome:'unknown'});controller.abort(error);reject(error);
  },timeoutMs)});
  return Promise.race([work,deadline,aborted]).finally(()=>{clearTimeout(timer);controllers.delete(controller)});
}
function withSignal(query,signal){return typeof query.abortSignal==='function'?query.abortSignal(signal):query}
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const equivalent=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const clone=value=>JSON.parse(JSON.stringify(value));
let version=window.__adwaaStateVersion||null,accepted=null,pending=null,active=0;
let resolveReady;const ready=new Promise(resolve=>resolveReady=resolve);
function conflict(){return Object.assign(new Error('وصل تعديل من جهاز آخر. لم تتم الكتابة فوقه. احتفظ بمدخلاتك وحدّث البيانات للمراجعة.'),{code:'ADWAA_CONFLICT',outcome:'conflict'})}
function validateState(value){
  const invalid=()=>Object.assign(new Error('بنية بيانات النظام غير سليمة؛ لم يُسمح باستبدالها ببيانات فارغة.'),{code:'ADWAA_INVALID_STATE',outcome:'not-written'});
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.bookings))throw invalid();
  for(const name of ['expenses','maintenanceJobs','installmentPurchases','subscriptions','subscriptionDrafts','customerCredits','accountingNotes','notifications','auditLog','backupHistory']){
    if(value[name]!==undefined&&!Array.isArray(value[name]))throw invalid();
  }
}
function acceptRemote(row){
  validateState(row?.data);
  if(!row?.updated_at||!Number.isFinite(Date.parse(row.updated_at)))throw new Error('نسخة السجل غير متاحة؛ لم يُسمح بالكتابة.');
  version=row.updated_at;window.__adwaaStateVersion=version;
  accepted=clone(row.data);pending=null;
}
async function readRow(){
  const result=await request(signal=>withSignal(supabaseClient.from('app_state').select('id,data,updated_at').eq('id',STATE_ROW_ID).maybeSingle(),signal));
  if(result.error)throw result.error;
  if(!result.data?.updated_at)throw new Error('تعذر قراءة سجل النظام وإصداره. لم تُنشأ بيانات تلقائيًا.');
  validateState(result.data.data);
  return result.data;
}
const sameVersion=(a,b)=>!!a&&!!b&&Date.parse(a)===Date.parse(b);
const nextVersion=base=>new Date(Math.max(Date.now(),Date.parse(base)+1)).toISOString();
async function writeRow(snapshot,base,client=supabaseClient,rowId=STATE_ROW_ID,next=null){
  validateState(snapshot);
  if(!base||!Number.isFinite(Date.parse(base)))throw new Error('لم تُقرأ نسخة السجل.');
  next=next||nextVersion(base);
  const payload={data:clone(snapshot),updated_at:next};
  const result=await request(signal=>withSignal(client.from('app_state').update(payload)
    .eq('id',rowId).eq('updated_at',base).select('id,updated_at').maybeSingle(),signal));
  if(result.error)throw result.error;
  if(!result.data?.id)throw conflict();
  return {...result.data,updated_at:result.data.updated_at||next};
}
function hasUnsavedChanges(){
  if(active||pending)return true;
  try{return accepted!==null&&!equivalent(normalizeDB(db),normalizeDB(accepted))}catch(_){return true}
}
window.AdwaaPersistence={request,withSignal,ready,readRow,writeRow,acceptRemote,hasUnsavedChanges,reset(){
  generation++;version=null;accepted=null;pending=null;window.__adwaaStateVersion=null;
  for(const controller of controllers)controller.abort(Object.assign(new Error('انتهت جلسة الحفظ.'),{code:'ADWAA_SESSION_CLOSED',outcome:'unknown'}));
}};

function install(){
  const current=window.persist;
  if(typeof current!=='function')return false;
  let saveQueue=Promise.resolve();
  async function reconcile(){
    if(!pending)return;
    const row=await readRow();
    if(equivalent(row.data,pending.snapshot)){
      acceptRemote(row);return;
    }
    // The prior request may still commit. A new CAS uses the SAME old version,
    // so only one can win; a late request cannot overwrite the winning write.
    if(!sameVersion(row.updated_at,pending.base))throw conflict();
    pending=null;
  }
  async function saveSnapshot(snapshot){
    await reconcile();
    if(accepted!==null&&equivalent(snapshot,accepted))return 'reconciled';
    if(!version)throw Object.assign(new Error('حمّل بيانات النظام أولًا قبل الحفظ.'),{code:'ADWAA_NOT_LOADED',outcome:'not-written'});
    const attempt={snapshot,base:version,next:nextVersion(version)};
    pending=attempt;
    try{
      const written=await writeRow(snapshot,attempt.base,supabaseClient,STATE_ROW_ID,attempt.next);
      acceptRemote({data:snapshot,updated_at:written.updated_at});
      return 'update';
    }catch(error){
      if(error.code==='ADWAA_CONFLICT'||error.code==='ADWAA_SESSION_CLOSED')throw error;
      try{
        const row=await readRow();
        if(equivalent(row.data,snapshot)){acceptRemote(row);return 'reconciled'}
        if(!sameVersion(row.updated_at,attempt.base))throw conflict();
      }catch(checkError){if(checkError.code==='ADWAA_CONFLICT')throw checkError}
      // Preserve uncertainty and stable operation IDs. Never upsert over another writer.
      throw error;
    }
  }
  async function performSave(snapshot,ownerGeneration){
    if(ownerGeneration!==generation)throw Object.assign(new Error('انتهت جلسة العملية.'),{code:'ADWAA_SESSION_CLOSED'});
    if(!currentUser){alert('انتهت جلسة الدخول. سجّل الدخول من جديد.');showLogin();return false}
    active++;
    try{
      invalidateCaches();scheduleRenderAll();
      void window.AdwaaLocalVault?.cache(snapshot);
      const mode=await saveSnapshot(snapshot);
      remoteReady=true;lastSuccessfulWriteAt=new Date().toISOString();lastSyncError='';
      try{Promise.resolve(markRemoteStateConfirmed(snapshot)).catch(()=>{lastConfirmedRemoteHash=''})}catch(_){lastConfirmedRemoteHash=''}
      try{setSyncStatus('تم الحفظ في قاعدة البيانات','ok')}catch(_){}
      window.__adwaaLastPersistResult={ok:true,at:lastSuccessfulWriteAt,mode};
      return true;
    }catch(error){
      if(ownerGeneration!==generation)throw error;
      remoteReady=false;lastSyncError=String(error?.message||'لم يتأكد الحفظ');
      window.__adwaaLastPersistResult={ok:false,outcome:error.outcome||'unknown',code:error.code||'',error:lastSyncError,at:new Date().toISOString()};
      try{Promise.resolve(renderDataProtectionSyncStatus()).catch(()=>{})}catch(_){}
      try{setSyncStatus(lastSyncError,'warning')}catch(_){}
      throw error;
    }finally{active--}
  }
  const robustPersist=function(candidate){
    // Only the restore service supplies a candidate; ordinary callers use current db.
    validateState(candidate||db);
    const snapshot=clone(normalizeDB(candidate||db));
    const ownerGeneration=generation;
    const operation=saveQueue.then(()=>performSave(snapshot,ownerGeneration));
    saveQueue=operation.catch(()=>{});return operation;
  };
  robustPersist.__adwaaUpdatePath=true;robustPersist.__base=current;
  window.persist=robustPersist;try{persist=robustPersist}catch(_){}
  window.AdwaaPersistence.persist=robustPersist;resolveReady();return true;
}
if(!install()){
  let tries=0;const timer=setInterval(()=>{if(install()||++tries>=200)clearInterval(timer)},25);
}
})();
