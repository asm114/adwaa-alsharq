(()=>{
'use strict';
if(window.__adwaaBookingWelcomeConfirmationInstalled)return;
window.__adwaaBookingWelcomeConfirmationInstalled=true;

const digits=value=>String(value||'').replace(/\D/g,'');
const DEPOSIT_POLICY_TEXT='العربون غير مسترد نقدًا، وفي حال إلغاء الحجز يُحفظ كامل مبلغ العربون كرصيد للعميل لاستخدامه في حجز لاحق.';
const RESORT_CANCELLATION_TEXT='إذا ألغى المنتجع الحجز، يكون للعميل خيار استرجاع المبلغ أو إبقائه رصيدًا.';

function savedBooking(){
  try{if(typeof window.v92Booking==='function')return window.v92Booking()}catch(_){}
  const id=String(document.getElementById('bId')?.value||'').trim();
  return id&&Array.isArray(window.db?.bookings)?window.db.bookings.find(row=>String(row?.id||'')===id)||null:null;
}

function formBooking(){
  try{if(typeof window.getBookingFromForm==='function')return window.getBookingFromForm()}catch(_){}
  return savedBooking();
}

function resolvedBooking(){
  const saved=savedBooking()||{},form=formBooking()||{};
  return {
    ...saved,
    ...form,
    id:form.id||saved.id||'',
    code:form.code||saved.code||'',
    name:form.name||saved.name||'',
    phone:form.phone||saved.phone||'',
    date:form.date||saved.date||'',
    type:form.type||saved.type||'يومي',
    stayDays:form.stayDays||saved.stayDays||1
  };
}

function paidDepositAmount(booking){
  const payments=Array.isArray(booking?.payments)?booking.payments:[];
  const deposit=payments.find(row=>row?.type==='deposit');
  if(deposit&&Number(deposit.amount||0)>0)return Number(deposit.amount||0);
  return Math.max(0,Number(booking?.paid||0));
}

function dateLabel(value){
  const raw=String(value||'').trim();
  if(!raw)return '-';
  const date=new Date(`${raw}T12:00:00`);
  if(Number.isNaN(date.getTime()))return raw;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(date);
}

function bookingTimesSafe(booking){
  try{if(typeof window.bookingTimes==='function')return window.bookingTimes(booking)||{}}catch(_){}
  return {entry:'3:30 م',exit:booking?.type==='مبيت'?'8:00 ص':'3:00 ص'};
}

function welcomeConfirmationText(booking){
  const b=booking||resolvedBooking(),times=bookingTimesSafe(b),hasDeposit=paidDepositAmount(b)>0;
  const lines=[
    'حياك الله ضيفنا الكريم 🌷',
    'تم تأكيد حجزكم لدينا.',
    '',
    `رقم الحجز: ${b.code||'-'}`,
    `التاريخ: ${dateLabel(b.date)}`,
    `الدخول: ${times.entry||'-'}`,
    `الخروج: ${times.exit||'-'}`
  ];
  if(hasDeposit)lines.push('',DEPOSIT_POLICY_TEXT,RESORT_CANCELLATION_TEXT);
  lines.push('','سعداء باستضافتكم ونتمنى لكم إقامة جميلة.');
  return lines.join('\n');
}

function formatSentAt(value){
  if(!value)return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}

function refreshWelcomeStatus(){
  const booking=savedBooking();
  const status=document.getElementById('v92WelcomeConfirmationSent');
  const button=document.querySelector('[data-v92-action="welcome-confirmation-send"]');
  const sentAt=booking?.manualOperations?.welcome?.sentAt||booking?.manualMessages?.welcome||'';
  if(status){
    status.className=`v92-status ${sentAt?'done':'none'}`;
    status.innerHTML=sentAt?`🟢 تم الإرسال<span class="v92-time">${formatSentAt(sentAt)}</span>`:'🔴 لم يتم';
  }
  if(button){
    const phone=resolvedBooking().phone;
    button.disabled=!booking||!digits(phone);
  }
}

function hideInvoiceCard(){
  const invoiceButton=document.querySelector('[data-v92-action="invoice-create"]');
  const card=invoiceButton?.closest('.v92-operation-card');
  if(card)card.remove();
  const grid=document.querySelector('#v92SendCenter .v92-doc-grid');
  if(grid)grid.style.gridTemplateColumns='1fr';
}

function ensureWelcomeCard(){
  const grid=document.querySelector('#v92SendCenter .v92-message-grid');
  if(!grid||grid.querySelector('[data-booking-welcome-confirmation]'))return;
  const item=document.createElement('div');
  item.className='v92-message-item';
  item.dataset.bookingWelcomeConfirmation='1';
  item.innerHTML='<button class="primary" type="button" data-v92-action="welcome-confirmation-send">🌷 ترحيب وتأكيد الحجز</button><span id="v92WelcomeConfirmationSent" class="v92-status none">🔴 لم يتم</span>';
  const due=grid.querySelector('[data-v92-action="due-send"]')?.closest('.v92-message-item');
  if(due)grid.insertBefore(item,due);else grid.prepend(item);
  item.querySelector('button')?.addEventListener('click',()=>{
    if(typeof window.sendManualWhatsApp!=='function'){
      alert('تعذر فتح رسالة التأكيد الآن. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    window.sendManualWhatsApp('welcome');
  });
}

function installWelcomeText(){
  window.welcomeMessageText=welcomeConfirmationText;
}

function refreshUi(){
  installWelcomeText();
  hideInvoiceCard();
  ensureWelcomeCard();
  refreshWelcomeStatus();
}

function installRenderHook(){
  const original=window.renderSendStatus;
  if(typeof original!=='function'||original.__adwaaWelcomeConfirmationWrapped)return false;
  const wrapped=function(){
    const result=original.apply(this,arguments);
    setTimeout(refreshUi,0);
    return result;
  };
  wrapped.__adwaaWelcomeConfirmationWrapped=true;
  wrapped.__original=original;
  window.renderSendStatus=wrapped;
  return true;
}

const autoWelcomePrepared=new Set();

function bookingBySnapshot(snapshot){
  const rows=Array.isArray(window.db?.bookings)?window.db.bookings:[];
  return rows.find(row=>
    row?.recordType!=='family'&&
    String(row?.code||'')===String(snapshot.code||'')&&
    String(row?.phone||'')===String(snapshot.phone||'')&&
    String(row?.date||'')===String(snapshot.date||'')
  )||null;
}

function prepareWelcomeAfterNewBooking(snapshot){
  const booking=bookingBySnapshot(snapshot);
  if(!booking||booking.status!=='مؤكد'||booking.recordType==='family')return;
  if(booking.manualOperations?.welcome?.sentAt||booking.manualMessages?.welcome)return;
  const key=String(booking.id||booking.code||'');
  if(!key||autoWelcomePrepared.has(key))return;
  const phone=digits(booking.phone);
  if(!phone)return;
  autoWelcomePrepared.add(key);
  const idField=document.getElementById('bId');
  if(idField)idField.value=booking.id||'';
  setTimeout(()=>{
    if(typeof window.sendManualWhatsApp==='function')window.sendManualWhatsApp('welcome');
  },0);
}

function installAutoWelcomeHook(){
  const original=window.saveBooking;
  if(typeof original!=='function'||original.__adwaaAutoWelcomeWrapped)return false;
  const wrapped=async function(event){
    const id=String(document.getElementById('bId')?.value||'').trim();
    const snapshot={
      isNew:!id,
      recordType:String(document.getElementById('bRecordType')?.value||'customer'),
      code:String(document.getElementById('bCode')?.value||'').trim(),
      phone:String(document.getElementById('bPhone')?.value||'').trim(),
      date:String(document.getElementById('bDate')?.value||'').trim()
    };
    const result=await original.apply(this,arguments);
    if(snapshot.isNew&&snapshot.recordType!=='family')prepareWelcomeAfterNewBooking(snapshot);
    return result;
  };
  wrapped.__adwaaAutoWelcomeWrapped=true;
  wrapped.__original=original;
  window.saveBooking=wrapped;
  return true;
}

function start(){
  refreshUi();
  installRenderHook();
  installAutoWelcomeHook();
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    refreshUi();
    installRenderHook();installAutoWelcomeHook();
    if(document.querySelector('#v92SendCenter .v92-message-grid'))clearInterval(timer);
    if(tries>=20)clearInterval(timer);
  },250);
  document.addEventListener('input',event=>{if(['bPhone','bDate','bType','bCode','bPaid','bookingDepositAmount'].includes(event.target?.id))refreshWelcomeStatus()});
  document.addEventListener('change',event=>{if(['bPhone','bDate','bType','bCode','bPaid','bookingDepositAmount'].includes(event.target?.id))refreshWelcomeStatus()});
  window.addEventListener('focus',refreshWelcomeStatus);
  window.addEventListener('load',installAutoWelcomeHook,{once:true});
}

window.__adwaaDepositPolicyMessage={paidDepositAmount,DEPOSIT_POLICY_TEXT,RESORT_CANCELLATION_TEXT};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
