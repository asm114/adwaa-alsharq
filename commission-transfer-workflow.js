(()=>{
'use strict';
if(window.__adwaaCommissionTransferWorkflowInstalled)return;
window.__adwaaCommissionTransferWorkflowInstalled=true;

const DAY_MS=24*60*60*1000;
let modalOpen=false;
let checking=false;
let internalPersist=false;

const statusOf=b=>typeof commissionStatus==='function'?commissionStatus(b):(b?.commissionSnapshot?.status||'not_earned');
const amountOf=b=>typeof managerCommissionAmount==='function'?managerCommissionAmount(b):Math.max(0,Number(b?.commissionSnapshot?.amount||0));
const moneyText=v=>typeof money==='function'?money(v):`${Number(v||0).toLocaleString('ar-SA')} ر.س`;
const nowIso=()=>new Date().toISOString();
const fullyPaid=b=>{
  const total=Number(b?.total||0),paid=Number(b?.paid||0);
  return b?.recordType!=='family'&&b?.status!=='ملغي'&&Number.isFinite(total)&&Number.isFinite(paid)&&total>0&&paid>=total;
};

function outstandingBookings(){
  return (Array.isArray(db?.bookings)?db.bookings:[])
    .filter(b=>statusOf(b)==='earned'&&fullyPaid(b))
    .sort((a,b)=>String(a?.commissionSnapshot?.earnedAt||a?.date||'').localeCompare(String(b?.commissionSnapshot?.earnedAt||b?.date||'')));
}
function reminderDue(b){
  const next=b?.commissionSnapshot?.remindCommissionAt;
  if(!next)return true;
  const time=new Date(next).getTime();
  return !Number.isFinite(time)||time<=Date.now();
}
function addCommissionReminderNotification(b){
  if(typeof addNotification!=='function'||!fullyPaid(b))return;
  const message=`عمولة الحجز #${b.code||''} استحقت بعد اكتمال السداد بقيمة ${moneyText(amountOf(b))} ولم يتم تأكيد تحويلها إلى حسابك الخاص.`;
  const exists=(db.notifications||[]).some(n=>n?.type==='commission_transfer_reminder'&&n?.bookingId===b.id&&n?.read===false);
  if(!exists)addNotification('commission_transfer_reminder',message,'',b.id);
}
function ensureModal(){
  let modal=document.getElementById('commissionTransferPrompt');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='commissionTransferPrompt';
  modal.className='modal';
  modal.innerHTML=`<div class="sheet" style="max-width:560px;margin:auto"><div class="sheet-head"><h2>تحويل عمولة المدير</h2><button class="close" type="button" data-commission-close>×</button></div><div id="commissionTransferPromptBody"></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-commission-close]')?.addEventListener('click',()=>closePrompt(false));
  return modal;
}
function closePrompt(scheduleNext=false){
  const modal=document.getElementById('commissionTransferPrompt');
  modal?.classList.remove('open');
  modalOpen=false;
  if(scheduleNext)setTimeout(checkOutstanding,500);
}
async function persistSafely(){
  if(typeof persist!=='function')return;
  internalPersist=true;
  try{await persist()}finally{internalPersist=false}
}
async function markReceived(id){
  const b=(db.bookings||[]).find(x=>x.id===id);
  if(!b||statusOf(b)!=='earned'||!fullyPaid(b))return closePrompt(true);
  const before={commissionReceivedAt:b.commissionReceivedAt||'',commissionReceivedBy:b.commissionReceivedBy||'',commissionSnapshot:{...(b.commissionSnapshot||{})}};
  const receivedAt=nowIso();
  b.commissionReceivedAt=receivedAt;
  b.commissionReceivedBy=typeof currentUserLabel==='function'?currentUserLabel():'';
  b.commissionSnapshot={...(b.commissionSnapshot||{}),received:true,receivedAt,status:'received',remindCommissionAt:null,lastCommissionPromptAt:receivedAt};
  if(typeof addAudit==='function')addAudit('تأكيد استلام','عمولة المدير',`${b.name||''} — #${b.code||''} — تم تحويل ${moneyText(amountOf(b))} إلى الحساب الخاص`,before,{commissionReceivedAt:b.commissionReceivedAt,commissionReceivedBy:b.commissionReceivedBy,status:'received'});
  closePrompt(false);
  await persistSafely();
  setTimeout(checkOutstanding,500);
}
async function deferCommission(id){
  const b=(db.bookings||[]).find(x=>x.id===id);
  if(!b||statusOf(b)!=='earned'||!fullyPaid(b))return closePrompt(true);
  const at=nowIso(),next=new Date(Date.now()+DAY_MS).toISOString();
  b.commissionSnapshot={...(b.commissionSnapshot||{}),received:false,receivedAt:null,status:'earned',lastCommissionPromptAt:at,remindCommissionAt:next};
  addCommissionReminderNotification(b);
  if(typeof addAudit==='function')addAudit('تأجيل استلام','عمولة المدير',`${b.name||''} — #${b.code||''} — لم يتم تحويل العمولة بعد؛ تذكير لاحق`,null,{status:'earned',remindCommissionAt:next});
  closePrompt(false);
  await persistSafely();
  setTimeout(checkOutstanding,500);
}
function showPrompt(b){
  if(!b||modalOpen||!fullyPaid(b))return;
  modalOpen=true;
  const modal=ensureModal(),body=modal.querySelector('#commissionTransferPromptBody');
  const count=outstandingBookings().length;
  body.innerHTML=`<div class="notice" style="line-height:1.9"><b>عمولة مستحقة بعد اكتمال السداد: ${moneyText(amountOf(b))}</b><br>الحجز: ${escapeHtml(b.name||'')} #${escapeHtml(b.code||'')}<br>هل تم تحويل مبلغ العمولة من حساب التشغيل إلى حسابك الخاص؟</div>${count>1?`<div class="meta" style="margin-bottom:12px">يوجد ${count} عمولات مستحقة حاليًا.</div>`:''}<div class="actions"><button class="primary" type="button" data-commission-yes>نعم، تم تحويلها لحسابي الخاص</button><button class="secondary" type="button" data-commission-no>لا، ذكّرني لاحقًا</button></div>`;
  body.querySelector('[data-commission-yes]')?.addEventListener('click',()=>markReceived(b.id));
  body.querySelector('[data-commission-no]')?.addEventListener('click',()=>deferCommission(b.id));
  modal.classList.add('open');
}
function checkOutstanding(){
  if(checking||modalOpen||internalPersist)return;
  checking=true;
  try{
    const due=outstandingBookings().find(reminderDue);
    if(due)showPrompt(due);
  }finally{checking=false}
}

function replaceConfirmCommissionReceived(){
  try{
    const replacement=async bookingId=>{
      const b=(db.bookings||[]).find(x=>x.id===bookingId);
      if(!b||statusOf(b)!=='earned'||!fullyPaid(b))return;
      showPrompt(b);
    };
    confirmCommissionReceived=replacement;
    window.confirmCommissionReceived=replacement;
  }catch(error){console.warn('تعذر ربط نافذة تأكيد العمولة',error)}
}
function wrapPersist(){
  try{
    if(typeof persist!=='function'||persist.__commissionTransferWrapped)return;
    const base=persist;
    const wrapped=async function(...args){const result=await base.apply(this,args);if(!internalPersist)setTimeout(checkOutstanding,300);return result};
    wrapped.__commissionTransferWrapped=true;
    wrapped.__base=base;
    persist=wrapped;
    window.persist=wrapped;
  }catch(error){console.warn('تعذر ربط تذكير العمولة بالحفظ',error)}
}
function install(){
  replaceConfirmCommissionReceived();
  wrapPersist();
  setTimeout(checkOutstanding,700);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,800);
window.addEventListener('focus',()=>setTimeout(checkOutstanding,250));
})();
