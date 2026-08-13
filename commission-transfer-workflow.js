(()=>{
'use strict';
if(window.__adwaaCommissionTransferWorkflowInstalled)return;
window.__adwaaCommissionTransferWorkflowInstalled=true;

const DAY_MS=24*60*60*1000;
let modalOpen=false;
let checking=false;
let internalPersist=false;

const bookingStatus=row=>typeof window.commissionStatus==='function'?window.commissionStatus(row):(row?.commissionSnapshot?.status||'not_earned');
const bookingAmount=row=>typeof window.managerCommissionAmount==='function'?window.managerCommissionAmount(row):Math.max(0,Number(row?.commissionSnapshot?.amount||0));
const subscriptionStatus=row=>typeof window.subscriptionCommissionStatus==='function'?window.subscriptionCommissionStatus(row):(row?.commissionSnapshot?.status||'not_earned');
const subscriptionAmount=row=>typeof window.subscriptionCommissionAmount==='function'?window.subscriptionCommissionAmount(row):Math.max(0,Number(row?.commissionSnapshot?.amount||0));
const moneyText=value=>typeof window.money==='function'?window.money(value):`${Number(value||0).toLocaleString('ar-SA')} ر.س`;
const nowIso=()=>new Date().toISOString();
const bookingFullyPaid=row=>{
  const total=Number(row?.total||0),paid=Number(row?.paid||0);
  return row?.recordType!=='family'&&row?.status!=='ملغي'&&Number.isFinite(total)&&Number.isFinite(paid)&&total>0&&paid>=total;
};
const subscriptionFullyPaid=row=>typeof window.subscriptionCommissionFullyPaid==='function'?window.subscriptionCommissionFullyPaid(row):Number(row?.total||0)>0&&Number(row?.paid||0)>=Number(row?.total||0);

function bookings(){return Array.isArray(window.db?.bookings)?window.db.bookings:[]}
function subscriptions(){return Array.isArray(window.db?.subscriptions)?window.db.subscriptions:[]}
function itemStatus(item){return item?.kind==='subscription'?subscriptionStatus(item.row):bookingStatus(item?.row)}
function itemAmount(item){return item?.kind==='subscription'?subscriptionAmount(item.row):bookingAmount(item?.row)}
function itemFullyPaid(item){return item?.kind==='subscription'?subscriptionFullyPaid(item.row):bookingFullyPaid(item?.row)}
function itemSnapshot(item){return item?.row?.commissionSnapshot||{}}
function itemKey(item){return `${item?.kind||'booking'}:${item?.row?.id||''}`}
function itemName(item){return item?.row?.name||item?.row?.customerName||'العميل'}
function itemReference(item){return item?.kind==='subscription'?`اشتراك ${itemName(item)}`:`الحجز #${item?.row?.code||''}`}
function findItem(kind,id){
  const row=(kind==='subscription'?subscriptions():bookings()).find(value=>value?.id===id);
  return row?{kind,row}:null;
}
function outstandingItems(){
  const rows=[
    ...bookings().filter(row=>bookingStatus(row)==='earned'&&bookingFullyPaid(row)).map(row=>({kind:'booking',row})),
    ...subscriptions().filter(row=>subscriptionStatus(row)==='earned'&&subscriptionFullyPaid(row)).map(row=>({kind:'subscription',row}))
  ];
  return rows.sort((a,b)=>String(itemSnapshot(a).earnedAt||a.row?.date||a.row?.createdAt||'').localeCompare(String(itemSnapshot(b).earnedAt||b.row?.date||b.row?.createdAt||'')));
}
function reminderDue(item){
  const next=itemSnapshot(item).remindCommissionAt;
  if(!next)return true;
  const time=new Date(next).getTime();
  return !Number.isFinite(time)||time<=Date.now();
}
function addCommissionReminderNotification(item){
  if(typeof window.addNotification!=='function'||!itemFullyPaid(item))return;
  const key=itemKey(item),message=`عمولة ${itemReference(item)} استحقت بعد اكتمال السداد بقيمة ${moneyText(itemAmount(item))} ولم يتم تأكيد تحويلها إلى حسابك الخاص.`;
  const exists=(window.db?.notifications||[]).some(note=>note?.commissionItemKey===key&&note?.read===false);
  if(exists)return;
  const before=(window.db?.notifications||[]).length;
  window.addNotification(item.kind==='subscription'?'subscription_commission_transfer_reminder':'commission_transfer_reminder',message,'',item.kind==='booking'?item.row.id:'');
  const created=(window.db?.notifications||[])[0];
  if(created&&(window.db?.notifications||[]).length>=before)created.commissionItemKey=key;
}
function ensureModal(){
  let modal=document.getElementById('commissionTransferPrompt');
  if(modal)return modal;
  modal=document.createElement('div');modal.id='commissionTransferPrompt';modal.className='modal';
  modal.innerHTML=`<div class="sheet" style="max-width:560px;margin:auto"><div class="sheet-head"><h2>تحويل عمولة المدير</h2><button class="close" type="button" data-commission-close>×</button></div><div id="commissionTransferPromptBody"></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-commission-close]')?.addEventListener('click',()=>closePrompt(false));
  return modal;
}
function closePrompt(scheduleNext=false){
  const modal=document.getElementById('commissionTransferPrompt');modal?.classList.remove('open');modalOpen=false;
  if(scheduleNext)setTimeout(checkOutstanding,500);
}
async function persistSafely(item=null){
  if(typeof window.persist!=='function')return;
  internalPersist=true;
  try{await window.persist()}finally{internalPersist=false}
  if(item?.kind==='subscription')window.dispatchEvent(new Event('adwaa-subscription-updated'));
}
function receivedBy(){return typeof window.currentUserLabel==='function'?window.currentUserLabel():''}
async function markReceived(kind,id){
  const item=findItem(kind,id);if(!item||itemStatus(item)!=='earned'||!itemFullyPaid(item))return closePrompt(true);
  const row=item.row,before={commissionReceivedAt:row.commissionReceivedAt||'',commissionReceivedBy:row.commissionReceivedBy||'',commissionSnapshot:{...(row.commissionSnapshot||{})}},receivedAt=nowIso();
  row.commissionReceivedAt=receivedAt;row.commissionReceivedBy=receivedBy();
  row.commissionSnapshot={...(row.commissionSnapshot||{}),received:true,receivedAt,receivedBy:row.commissionReceivedBy,status:'received',remindCommissionAt:null,lastCommissionPromptAt:receivedAt};
  if(typeof window.addAudit==='function')window.addAudit('تأكيد استلام',item.kind==='subscription'?'عمولة اشتراك':'عمولة المدير',`${itemReference(item)} — تم تحويل ${moneyText(itemAmount(item))} إلى الحساب الخاص`,before,{commissionReceivedAt:row.commissionReceivedAt,commissionReceivedBy:row.commissionReceivedBy,status:'received'});
  closePrompt(false);await persistSafely(item);setTimeout(checkOutstanding,500);
}
async function deferCommission(kind,id){
  const item=findItem(kind,id);if(!item||itemStatus(item)!=='earned'||!itemFullyPaid(item))return closePrompt(true);
  const at=nowIso(),next=new Date(Date.now()+DAY_MS).toISOString(),row=item.row;
  row.commissionSnapshot={...(row.commissionSnapshot||{}),received:false,receivedAt:null,status:'earned',lastCommissionPromptAt:at,remindCommissionAt:next};
  addCommissionReminderNotification(item);
  if(typeof window.addAudit==='function')window.addAudit('تأجيل استلام',item.kind==='subscription'?'عمولة اشتراك':'عمولة المدير',`${itemReference(item)} — لم يتم تحويل العمولة بعد؛ تذكير لاحق`,null,{status:'earned',remindCommissionAt:next});
  closePrompt(false);await persistSafely(item);setTimeout(checkOutstanding,500);
}
async function markReceivedBeforeSystem(kind,id){
  const item=findItem(kind,id);if(!item||itemStatus(item)!=='earned')return closePrompt(true);
  const row=item.row;
  if(!confirm(`تسجيل عمولة ${itemReference(item)} كمستلمة سابقًا قبل نظام المتابعة؟\nلن تدخل ضمن المستحقات الحالية.`))return;
  row.commissionSnapshot={...(row.commissionSnapshot||{}),received:false,receivedAt:null,status:'received_before_system',remindCommissionAt:null,lastCommissionPromptAt:nowIso()};
  row.commissionReceivedAt='';row.commissionReceivedBy='';
  if(typeof window.addAudit==='function')window.addAudit('تسجيل تاريخي',item.kind==='subscription'?'عمولة اشتراك':'عمولة المدير',`${itemReference(item)} — مستلمة سابقًا قبل نظام المتابعة`,null,{status:'received_before_system'});
  closePrompt(false);await persistSafely(item);setTimeout(checkOutstanding,500);
}
function showPrompt(item){
  if(!item||modalOpen||!itemFullyPaid(item)||itemStatus(item)!=='earned')return;
  if(document.querySelector('.modal.open:not(#commissionTransferPrompt)')){setTimeout(checkOutstanding,700);return}
  modalOpen=true;
  const modal=ensureModal(),body=modal.querySelector('#commissionTransferPromptBody'),count=outstandingItems().length,typeLabel=item.kind==='subscription'?'الاشتراك الرئيسي':'الحجز';
  body.innerHTML=`<div class="notice" style="line-height:1.9"><b>عمولة مستحقة بعد اكتمال السداد: ${moneyText(itemAmount(item))}</b><br>${typeLabel}: ${escapeHtml(itemName(item))}${item.kind==='booking'?` #${escapeHtml(item.row.code||'')}`:''}<br>هل تم تحويل مبلغ العمولة من حساب التشغيل إلى حسابك الخاص؟</div>${count>1?`<div class="meta" style="margin-bottom:12px">يوجد ${count} عمولات مستحقة حاليًا.</div>`:''}<div class="actions"><button class="primary" type="button" data-commission-yes>نعم، تم تحويلها لحسابي الخاص</button><button class="secondary" type="button" data-commission-no>لا، ذكّرني لاحقًا</button><button class="secondary" type="button" data-commission-old>مستلمة سابقًا قبل النظام</button></div>`;
  body.querySelector('[data-commission-yes]')?.addEventListener('click',()=>markReceived(item.kind,item.row.id));
  body.querySelector('[data-commission-no]')?.addEventListener('click',()=>deferCommission(item.kind,item.row.id));
  body.querySelector('[data-commission-old]')?.addEventListener('click',()=>markReceivedBeforeSystem(item.kind,item.row.id));
  modal.classList.add('open');
}
async function checkOutstanding(){
  if(checking||modalOpen||internalPersist)return;
  checking=true;
  try{
    if(typeof window.normalizeSubscriptionCommissions==='function')await window.normalizeSubscriptionCommissions();
    const due=outstandingItems().find(reminderDue);if(due)showPrompt(due);
  }catch(error){console.warn('تعذر فحص العمولات المستحقة',error)}finally{checking=false}
}
function replaceConfirmCommissionReceived(){
  try{
    const replacement=async bookingId=>{const item=findItem('booking',bookingId);if(item&&itemStatus(item)==='earned'&&itemFullyPaid(item))showPrompt(item)};
    confirmCommissionReceived=replacement;window.confirmCommissionReceived=replacement;
  }catch(error){console.warn('تعذر ربط نافذة تأكيد العمولة',error)}
  window.confirmSubscriptionCommissionReceived=async subscriptionId=>{const item=findItem('subscription',subscriptionId);if(item&&itemStatus(item)==='earned'&&itemFullyPaid(item))showPrompt(item)};
}
function wrapPersist(){
  try{
    if(typeof window.persist!=='function'||window.persist.__commissionTransferWrapped)return;
    const base=window.persist;
    const wrapped=async function(...args){const result=await base.apply(this,args);if(!internalPersist)setTimeout(checkOutstanding,300);return result};
    wrapped.__commissionTransferWrapped=true;wrapped.__base=base;
    try{persist=wrapped}catch(_){}window.persist=wrapped;
  }catch(error){console.warn('تعذر ربط تذكير العمولة بالحفظ',error)}
}
function install(){replaceConfirmCommissionReceived();wrapPersist();setTimeout(checkOutstanding,700)}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,800);
window.addEventListener('focus',()=>setTimeout(checkOutstanding,250));
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(checkOutstanding,150));
})();
