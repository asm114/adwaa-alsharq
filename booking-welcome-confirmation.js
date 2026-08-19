(()=>{
'use strict';
if(window.__adwaaBookingWelcomeConfirmationInstalled)return;
window.__adwaaBookingWelcomeConfirmationInstalled=true;

const digits=value=>String(value||'').replace(/\D/g,'');

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
  const b=booking||resolvedBooking(),times=bookingTimesSafe(b);
  return [
    'حياك الله ضيفنا الكريم 🌷',
    'تم تأكيد حجزكم لدينا.',
    '',
    `رقم الحجز: ${b.code||'-'}`,
    `التاريخ: ${dateLabel(b.date)}`,
    `الدخول: ${times.entry||'-'}`,
    `الخروج: ${times.exit||'-'}`,
    '',
    'سعداء باستضافتكم ونتمنى لكم إقامة جميلة.'
  ].join('\n');
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

function start(){
  refreshUi();
  installRenderHook();
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    refreshUi();
    if(installRenderHook()&&document.querySelector('#v92SendCenter .v92-message-grid'))clearInterval(timer);
    if(tries>=20)clearInterval(timer);
  },250);
  document.addEventListener('input',event=>{if(['bPhone','bDate','bType','bCode'].includes(event.target?.id))refreshWelcomeStatus()});
  document.addEventListener('change',event=>{if(['bPhone','bDate','bType','bCode'].includes(event.target?.id))refreshWelcomeStatus()});
  window.addEventListener('focus',refreshWelcomeStatus);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
