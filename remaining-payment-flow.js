(()=>{
'use strict';
if(window.__adwaaRemainingPaymentFlowInstalled)return;
window.__adwaaRemainingPaymentFlowInstalled=true;

const REMINDER_HOUR=2;
const SNOOZE_MINUTES=30;
let reminderOpen=false;
let boundaryTimer=0;
let retryTimer=0;

const state=()=>window.db;
const bookings=()=>Array.isArray(state()?.bookings)?state().bookings:[];
const notifications=()=>{const db=state();if(!db)return[];db.notifications=Array.isArray(db.notifications)?db.notifications:[];return db.notifications};
const safeNumber=value=>Math.max(0,Number(value||0));
const remaining=booking=>Math.max(0,safeNumber(booking?.total)-safeNumber(booking?.paid));
const active=booking=>booking&&booking.recordType!=='family'&&booking.status!=='ملغي';
const isoDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const todayIso=()=>isoDate(new Date());
const money=value=>typeof window.money==='function'?window.money(value):`${safeNumber(value).toLocaleString('ar-SA')} ر.س`;
const nowIso=()=>new Date().toISOString();
const reminderKey=booking=>`ops:remaining_payment:${booking.id}`;

function bookingById(id){return bookings().find(row=>row?.id===id)||null}
function currentBooking(){const id=String(document.getElementById('bId')?.value||'').trim();return id?bookingById(id):null}
function formRemaining(booking){
  if(!booking)return 0;
  const currentId=String(document.getElementById('bId')?.value||'').trim();
  if(currentId===String(booking.id||'')){
    const total=document.getElementById('bTotal'),paid=document.getElementById('bPaid');
    if(total&&paid)return Math.max(0,safeNumber(total.value)-safeNumber(paid.value));
  }
  return remaining(booking);
}
function existingReminder(booking){const key=reminderKey(booking);return notifications().find(item=>item?.reminderKey===key&&!item.resolvedAt)||null}
function snoozed(item){return !!(item?.snoozedUntil&&new Date(item.snoozedUntil).getTime()>Date.now())}
function resolveReminder(item){if(!item)return;item.read=true;item.resolvedAt=nowIso();item.snoozedUntil=''}
function snoozeReminder(item,minutes=SNOOZE_MINUTES){if(!item)return;item.read=false;item.snoozedUntil=new Date(Date.now()+minutes*60000).toISOString()}
function addReminder(booking){
  const existing=existingReminder(booking);if(existing)return existing;
  const due=remaining(booking);
  const item={id:crypto.randomUUID(),type:'operational',message:`هل تم استلام باقي المبلغ من ${booking.name||'العميل'}؟ المتبقي ${money(due)}.`,bookingId:booking.id,createdAt:nowIso(),read:false,reminderKey:reminderKey(booking),operationalType:'remaining_payment',snoozedUntil:'',resolvedAt:''};
  notifications().unshift(item);if(notifications().length>100)notifications().length=100;return item;
}
async function saveState(){
  try{if(typeof window.persist==='function')await window.persist();else localStorage.setItem('adwaaDB',JSON.stringify(state()))}catch(error){console.warn('تعذر حفظ تنبيه باقي المبلغ',error)}
  try{window.renderNotifications?.()}catch(_){}
}
function escapeText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[char]))}

function installStyles(){
  if(document.getElementById('remainingPaymentFlowStyles'))return;
  const style=document.createElement('style');style.id='remainingPaymentFlowStyles';style.textContent=`
    .remaining-payment-quick{grid-column:1/-1;display:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e2c268;background:#fff9e9;border-radius:15px}.remaining-payment-quick.show{display:flex}.remaining-payment-quick strong{display:block;font-size:17px}.remaining-payment-quick small{display:block;color:var(--muted);margin-top:3px}.remaining-payment-quick button{white-space:nowrap}
    .remaining-payment-methods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.remaining-payment-methods button{width:100%}
    @media(max-width:620px){.remaining-payment-quick{align-items:stretch;flex-direction:column}.remaining-payment-quick button{width:100%}.remaining-payment-methods{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
}

function ensureQuickAction(){
  installStyles();
  const form=document.getElementById('bookingForm'),paid=document.getElementById('bPaid');if(!form||!paid)return null;
  let card=document.getElementById('remainingPaymentQuick');
  if(!card){
    card=document.createElement('div');card.id='remainingPaymentQuick';card.className='remaining-payment-quick';card.innerHTML='<div><strong id="remainingPaymentQuickAmount">المتبقي: 0 ر.س</strong><small>للسداد الكامل فقط. للدفعة الجزئية استخدم «دفعة إضافية».</small></div><button class="primary" type="button" id="receiveRemainingPaymentButton">استلام باقي المبلغ</button>';
    const paymentCard=document.getElementById('bookingPaymentHistoryCard');
    if(paymentCard?.parentElement)paymentCard.parentElement.insertBefore(card,paymentCard);else paid.parentElement?.parentElement?.appendChild(card);
    document.getElementById('receiveRemainingPaymentButton')?.addEventListener('click',()=>{const booking=currentBooking();if(booking)openReceiveModal(booking,false)});
  }
  return card;
}
function refreshQuickAction(){
  const card=ensureQuickAction();if(!card)return;
  const booking=currentBooking(),due=formRemaining(booking),visible=!!booking&&active(booking)&&due>0;
  card.classList.toggle('show',visible);
  const label=document.getElementById('remainingPaymentQuickAmount');if(label)label.textContent=visible?`المتبقي: ${money(due)}`:'المتبقي: 0 ر.س';
}

function ensureModal(){
  let modal=document.getElementById('remainingPaymentModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='remainingPaymentModal';modal.className='modal';modal.innerHTML='<div class="sheet" style="max-width:560px;margin:auto"><div class="sheet-head"><h2 id="remainingPaymentTitle">استلام باقي المبلغ</h2><button class="close" id="remainingPaymentClose" type="button">×</button></div><div id="remainingPaymentBody" class="notice" style="line-height:1.9"></div><div class="actions" id="remainingPaymentActions"></div></div>';
  document.body.appendChild(modal);document.getElementById('remainingPaymentClose').addEventListener('click',()=>closeModal(true));return modal;
}
function closeModal(snooze=false){
  const modal=document.getElementById('remainingPaymentModal'),item=modal?._reminderItem;
  if(snooze&&item){snoozeReminder(item);saveState()}
  modal?.classList.remove('open');if(modal){modal._reminderItem=null;modal._bookingId=''}reminderOpen=false;
}
function methodButtons(booking,item){
  const actions=document.getElementById('remainingPaymentActions');if(!actions)return;
  actions.innerHTML='<div class="remaining-payment-methods"><button class="primary" data-method="transfer" type="button">تحويل بنكي</button><button class="secondary" data-method="cash" type="button">نقد</button><button class="secondary" data-method="card" type="button">شبكة / بطاقة</button><button class="secondary" data-method="other" type="button">أخرى</button></div><button class="secondary" id="remainingPaymentBack" type="button">رجوع</button>';
  actions.querySelectorAll('[data-method]').forEach(button=>button.addEventListener('click',async()=>{
    const method=button.dataset.method||'transfer';
    if(item)snoozeReminder(item,10);
    closeModal(false);
    await fillAndSubmitRemainingPayment(booking.id,method);
    setTimeout(scan,2500);
  }));
  document.getElementById('remainingPaymentBack')?.addEventListener('click',()=>openReceiveModal(booking,!!item,item));
}
function openReceiveModal(booking,fromReminder=false,item=null){
  const due=fromReminder?remaining(booking):formRemaining(booking);if(!booking||due<=0)return;
  const modal=ensureModal(),title=document.getElementById('remainingPaymentTitle'),body=document.getElementById('remainingPaymentBody'),actions=document.getElementById('remainingPaymentActions');
  modal._reminderItem=item||null;modal._bookingId=booking.id;reminderOpen=true;
  title.textContent=fromReminder?'متابعة باقي المبلغ':'استلام باقي المبلغ';
  body.innerHTML=`<b>${escapeText(booking.name||'العميل')}</b> — #${escapeText(booking.code||'')}<br>المتبقي: <b>${escapeText(money(due))}</b><br>${fromReminder?'<b>هل تم استلام باقي المبلغ؟</b>':'اختر طريقة استلام المبلغ الكامل.'}`;
  if(fromReminder){
    actions.innerHTML='<button class="primary" id="remainingPaymentYes" type="button">نعم، سجل الاستلام</button><button class="secondary" id="remainingPaymentLater" type="button">لا، ذكرني لاحقًا</button>';
    document.getElementById('remainingPaymentYes').onclick=()=>methodButtons(booking,item);
    document.getElementById('remainingPaymentLater').onclick=()=>closeModal(true);
  }else methodButtons(booking,null);
  modal.classList.add('open');
}

function waitForPaymentControls(bookingId,attempt=0){
  return new Promise(resolve=>{
    const currentId=String(document.getElementById('bId')?.value||'');
    const ready=currentId===bookingId&&document.getElementById('paymentAmount')&&document.getElementById('paymentType')&&document.getElementById('paymentMethod')&&document.getElementById('paymentSaveButton')&&document.getElementById('bookingForm');
    if(ready)return resolve(true);
    if(attempt===0)try{window.openBooking?.(bookingId)}catch(_){}
    if(attempt>=24)return resolve(false);
    setTimeout(()=>waitForPaymentControls(bookingId,attempt+1).then(resolve),50);
  });
}
async function fillAndSubmitRemainingPayment(bookingId,method='transfer'){
  const booking=bookingById(bookingId);if(!booking||remaining(booking)<=0)return false;
  const ready=await waitForPaymentControls(bookingId);if(!ready){alert('تعذر فتح أدوات الدفع لهذا الحجز. افتح الحجز وحاول مرة أخرى.');return false}
  const due=formRemaining(booking);if(due<=0){refreshQuickAction();return false}
  const amount=document.getElementById('paymentAmount'),type=document.getElementById('paymentType'),paymentMethod=document.getElementById('paymentMethod'),date=document.getElementById('paymentDate'),note=document.getElementById('paymentNote');
  amount.value=String(due);type.value='final';paymentMethod.value=method;if(date)date.value=todayIso();if(note)note.value='سداد باقي المبلغ';
  document.getElementById('paymentSaveButton').click();
  refreshQuickAction();
  const form=document.getElementById('bookingForm');if(typeof form?.requestSubmit==='function')form.requestSubmit();else form?.querySelector('button[type="submit"]')?.click();
  return true;
}
window.openRemainingPaymentPrompt=bookingId=>{const booking=bookingById(bookingId)||currentBooking();if(booking)openReceiveModal(booking,false)};
window.receiveBookingRemainingPayment=fillAndSubmitRemainingPayment;

function resolveObsolete(){
  notifications().forEach(item=>{
    if(item?.operationalType!=='remaining_payment'||item.resolvedAt)return;
    const booking=bookingById(item.bookingId);if(!booking||!active(booking)||remaining(booking)<=0)resolveReminder(item);
  });
}
function dueBookings(){
  const now=new Date(),today=isoDate(now),boundary=new Date(now.getFullYear(),now.getMonth(),now.getDate(),REMINDER_HOUR,0,0,0);
  if(now<boundary)return[];
  return bookings().filter(booking=>active(booking)&&booking.date===today&&remaining(booking)>0);
}
async function scan(){
  if(!state())return;
  const before=notifications().map(item=>`${item.id}:${item.resolvedAt||''}:${item.snoozedUntil||''}`).join('|');
  resolveObsolete();
  const candidates=dueBookings().map(booking=>({booking,item:addReminder(booking)})).filter(row=>!snoozed(row.item));
  const after=notifications().map(item=>`${item.id}:${item.resolvedAt||''}:${item.snoozedUntil||''}`).join('|');if(before!==after)await saveState();
  if(reminderOpen||!candidates.length)return;
  const anotherModal=[...document.querySelectorAll('.modal.open')].find(el=>el.id!=='remainingPaymentModal');
  if(anotherModal){clearTimeout(retryTimer);retryTimer=setTimeout(scan,5*60000);return}
  const {booking,item}=candidates[0];openReceiveModal(booking,true,item);
}
function scheduleBoundary(){
  clearTimeout(boundaryTimer);const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),REMINDER_HOUR,0,0,0);if(now>=next)next.setDate(next.getDate()+1);
  boundaryTimer=setTimeout(()=>{scan();scheduleBoundary()},Math.max(1000,next.getTime()-now.getTime()+250));
}
function wrapOpenBooking(){
  const current=window.openBooking;if(typeof current!=='function'||current.__remainingPaymentWrapped)return false;
  const wrapped=function(...args){const result=current.apply(this,args);setTimeout(refreshQuickAction,80);return result};wrapped.__remainingPaymentWrapped=true;wrapped.__base=current;window.openBooking=wrapped;return true;
}
function install(){
  installStyles();ensureQuickAction();wrapOpenBooking();refreshQuickAction();scan();scheduleBoundary();
  document.getElementById('bTotal')?.addEventListener('input',refreshQuickAction);
  document.getElementById('bookingDepositAmount')?.addEventListener('input',()=>setTimeout(refreshQuickAction,0));
  document.getElementById('bookingPaymentAddToggle')?.addEventListener('click',()=>setTimeout(refreshQuickAction,0));
  window.addEventListener('focus',()=>{refreshQuickAction();scan()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refreshQuickAction();scan()}});
  window.addEventListener('adwaa-subscription-updated',()=>setTimeout(scan,0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,650),{once:true});else setTimeout(install,650);
})();