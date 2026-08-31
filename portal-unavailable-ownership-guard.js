(()=>{
'use strict';
if(window.__adwaaPortalUnavailableOwnershipGuardInstalled)return;
window.__adwaaPortalUnavailableOwnershipGuardInstalled=true;

const TABLE='customer_portal_unavailable_periods';
const SOURCE_MANUAL='manual';

function client(){return window.portalAdminClient||window.supabaseClient||null}
function status(message,type='error'){
  try{window.portalUnavailableStatus?.(message,type)}catch(_){}
  if(type==='error')console.warn(message);
}
async function ownership(id){
  const db=client();
  if(!db||!id)return null;
  const {data,error}=await db.from(TABLE).select('id,source_type,booking_id,start_date,end_date').eq('id',id).maybeSingle();
  if(error){console.warn('تعذر التحقق من ملكية الفترة غير المتاحة',error);return null}
  return data||null;
}
function protectedMessage(period){
  return period?.source_type==='booking'
    ?'هذا التاريخ مرتبط بحجز ويُدار تلقائيًا من نظام الحجوزات. لا يمكن تعديله أو حذفه يدويًا.'
    :'هذه فترة قديمة محفوظة للمرجعية ولا يمكن تعديلها أو حذفها من الإدارة اليدوية.';
}
async function requireManual(id){
  const period=await ownership(id);
  if(!period){status('تعذر التحقق من ملكية الفترة. لم يتم تنفيذ أي تعديل.');return null}
  if(period.source_type!==SOURCE_MANUAL){status(protectedMessage(period));return null}
  return period;
}

const baseEdit=window.editPortalUnavailablePeriod;
if(typeof baseEdit==='function'){
  window.editPortalUnavailablePeriod=async function(id){
    if(!(await requireManual(id)))return false;
    return baseEdit.call(this,id);
  };
}

const baseSave=window.savePortalUnavailablePeriod;
if(typeof baseSave==='function'){
  window.savePortalUnavailablePeriod=async function(event){
    const id=String(document.getElementById('portalUnavailableId')?.value||'').trim();
    if(id&&!(await requireManual(id))){event?.preventDefault?.();return false}
    const result=await baseSave.call(this,event);
    queueMicrotask(markProtectedRows);
    return result;
  };
}

const baseDelete=window.deletePortalUnavailablePeriod;
if(typeof baseDelete==='function'){
  window.deletePortalUnavailablePeriod=async function(id){
    if(!(await requireManual(id)))return false;
    const result=await baseDelete.call(this,id);
    queueMicrotask(markProtectedRows);
    return result;
  };
}

const baseLoad=window.loadPortalUnavailablePeriods;
if(typeof baseLoad==='function'){
  window.loadPortalUnavailablePeriods=async function(...args){
    const result=await baseLoad.apply(this,args);
    await markProtectedRows();
    return result;
  };
}

function rowId(article){
  const button=article.querySelector('button[onclick*="PortalUnavailablePeriod"]');
  const match=String(button?.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
  return match?.[1]||'';
}
async function markProtectedRows(){
  const root=document.getElementById('portalUnavailableList');
  const db=client();
  if(!root||!db)return;
  const {data,error}=await db.from(TABLE).select('id,source_type,booking_id');
  if(error)return;
  const byId=new Map((data||[]).map(item=>[String(item.id),item]));
  root.querySelectorAll('.portal-unavailable-item').forEach(article=>{
    const id=rowId(article),period=byId.get(id);
    if(!period)return;
    article.querySelectorAll('[data-portal-ownership-badge]').forEach(node=>node.remove());
    const actions=article.querySelector('.portal-unavailable-actions');
    if(period.source_type===SOURCE_MANUAL){
      if(actions){const badge=document.createElement('span');badge.dataset.portalOwnershipBadge='manual';badge.className='portal-image-flag visible';badge.textContent='إغلاق يدوي';actions.prepend(badge)}
      return;
    }
    actions?.querySelectorAll('button').forEach(button=>button.remove());
    if(actions){
      const badge=document.createElement('span');badge.dataset.portalOwnershipBadge=period.source_type||'protected';badge.className='portal-image-flag cover';badge.textContent=period.source_type==='booking'?'حجز تلقائي — للقراءة فقط':'قديم — للقراءة فقط';actions.appendChild(badge);
    }
  });
}

window.addEventListener('adwaa-portal-admin-ready',()=>setTimeout(markProtectedRows,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(markProtectedRows,0),{once:true});else setTimeout(markProtectedRows,0);
})();
