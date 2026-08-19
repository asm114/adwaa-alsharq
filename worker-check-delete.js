(()=>{
'use strict';
if(window.__adwaaWorkerCheckDeleteInstalled)return;
window.__adwaaWorkerCheckDeleteInstalled=true;

const TABLE='customer_portal_worker_checks';
const BUCKET='customer-portal-worker-checks';
let injectBusy=false;
let lastSignature='';

const client=()=>window.portalAdminClient||null;
const currentBookingId=()=>String(document.getElementById('bId')?.value||'').trim();

async function adminReady(){
  if(window.portalAdminAuthState?.ready===true)return true;
  try{return await window.verifyPortalAdminSession?.()===true}catch(_){return false}
}

async function latestWorkerCheck(bookingId){
  const portalClient=client();
  if(!portalClient||!bookingId||!await adminReady())return null;
  const {data,error}=await portalClient
    .from(TABLE)
    .select('id,status,photo_paths,voice_path,created_at')
    .eq('booking_id',bookingId)
    .order('created_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error){console.warn('تعذر التحقق من تشييك العامل للحذف.',error);return null}
  return data||null;
}

function removalPaths(row){
  const photos=Array.isArray(row?.photo_paths)?row.photo_paths:[];
  return [...photos,row?.voice_path].map(value=>String(value||'').trim()).filter(Boolean);
}

async function deleteWorkerCheck(row,bookingId,button){
  if(!row?.id)return;
  const pending=row.status==='ready';
  const message=pending
    ?'حذف رابط تشييك العامل؟ سيتوقف الرابط الحالي ولن يستطيع العامل استخدامه.'
    :'حذف تشييك العامل نهائيًا؟ سيتم حذف التقرير والصور والتسجيل الصوتي ولا يمكن التراجع.';
  if(!confirm(message))return;
  const portalClient=client();
  if(!portalClient||!await adminReady()){alert('جلسة إدارة بوابة العملاء غير جاهزة.');return}
  button.disabled=true;button.textContent='جاري الحذف…';
  try{
    const {error}=await portalClient.from(TABLE).delete().eq('id',row.id);
    if(error)throw error;
    const paths=removalPaths(row);
    let mediaWarning=false;
    if(paths.length){
      const removal=await portalClient.storage.from(BUCKET).remove(paths);
      mediaWarning=!!removal.error;
      if(removal.error)console.warn('تعذر حذف بعض ملفات تشييك العامل من التخزين.',removal.error);
    }
    lastSignature='';
    if(mediaWarning)alert('تم حذف التشييك، لكن تعذر حذف بعض ملفاته من التخزين.');
    else alert('تم حذف تشييك العامل.');
    window.location.reload();
  }catch(error){
    console.error('تعذر حذف تشييك العامل.',error);
    alert('تعذر حذف تشييك العامل. تأكد من تطبيق صلاحية الحذف في قاعدة بوابة العملاء.');
    button.disabled=false;button.textContent=pending?'حذف رابط التشييك':'حذف تشييك العامل';
  }
}

async function injectDeleteButton(){
  if(injectBusy)return;
  const body=document.getElementById('workerCheckBookingBody');
  const bookingId=currentBookingId();
  if(!body||!bookingId)return;
  if(body.querySelector('[data-worker-check-delete]'))return;
  const bodyText=String(body.textContent||'').trim();
  if(!bodyText||bodyText.includes('لم تتم مشاركة التشييك بعد')||bodyText.includes('يظهر رابط التشييك بعد'))return;
  const signature=`${bookingId}:${bodyText}`;
  if(signature===lastSignature)return;
  injectBusy=true;lastSignature=signature;
  try{
    const row=await latestWorkerCheck(bookingId);
    if(!row||!['ready','submitted','reviewed'].includes(row.status))return;
    let actions=body.querySelector('.actions');
    if(!actions){actions=document.createElement('div');actions.className='actions';body.appendChild(actions)}
    if(actions.querySelector('[data-worker-check-delete]'))return;
    const button=document.createElement('button');
    button.type='button';button.className='danger';button.dataset.workerCheckDelete='1';
    button.textContent=row.status==='ready'?'حذف رابط التشييك':'حذف تشييك العامل';
    button.addEventListener('click',()=>deleteWorkerCheck(row,bookingId,button));
    actions.appendChild(button);
  }finally{injectBusy=false}
}

function scheduleInject(){setTimeout(injectDeleteButton,60)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleInject,{once:true});else scheduleInject();
new MutationObserver(scheduleInject).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
window.addEventListener('focus',scheduleInject);
window.addEventListener('adwaa-portal-admin-ready',scheduleInject);
})();
