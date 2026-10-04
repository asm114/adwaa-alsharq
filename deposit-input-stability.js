(()=>{
'use strict';
if(window.__adwaaDepositInputStabilityInstalled)return;
window.__adwaaDepositInputStabilityInstalled=true;
let requestedDeposit='';
let userEditedDeposit=false;

function depositInput(){return document.getElementById('bookingDepositAmount')}
function rememberDeposit(event){
  if(event.target?.id!=='bookingDepositAmount')return;
  requestedDeposit=String(event.target.value??'');
  userEditedDeposit=true;
}
function restoreDuringTotalTyping(event){
  if(event.target?.id!=='bTotal'||!userEditedDeposit)return;
  const input=depositInput();if(!input)return;
  if(String(input.value??'')!==requestedDeposit)input.value=requestedDeposit;
}
function resetForBookingOpen(){
  userEditedDeposit=false;
  requestedDeposit='';
  setTimeout(()=>{const input=depositInput();if(input)requestedDeposit=String(input.value??'')},0);
}
function install(){
  document.addEventListener('input',rememberDeposit,true);
  document.addEventListener('input',restoreDuringTotalTyping,false);
  const current=window.openBooking;
  if(typeof current==='function'&&!current.__depositInputStabilityWrapped){
    const wrapped=function(){resetForBookingOpen();return current.apply(this,arguments)};
    wrapped.__depositInputStabilityWrapped=true;wrapped.__base=current;window.openBooking=wrapped;
  }
}
window.__adwaaDepositInputStability={restoreDuringTotalTyping};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

(()=>{
  if(window.__adwaaBookingPersistUpdatePathLoader)return;
  window.__adwaaBookingPersistUpdatePathLoader=true;
  const script=document.createElement('script');
  script.async=false;
  script.src='booking-persist-update-path.js?v=20260916-1';
  script.onerror=()=>console.warn('تعذر تحميل مسار حفظ الحجوزات المحسن');
  document.head.appendChild(script);
})();

// Pre-cutover loader only. These helpers are inert until an explicit
// __adwaaBookingV2DualWrite.install({enable:true}) call is made after approval.
(()=>{
  if(window.__adwaaBookingV2HelperLoader)return;
  window.__adwaaBookingV2HelperLoader=true;
  const loadBridge=()=>{
    if(window.__adwaaBookingV2DualWriteInstalled)return;
    const bridge=document.createElement('script');
    bridge.async=false;
    bridge.src='booking-storage-v2-dualwrite.js?v=20260916-2';
    bridge.onerror=()=>console.warn('تعذر تحميل جسر الحجوزات v2');
    document.head.appendChild(bridge);
  };
  if(window.__adwaaBookingStorageV2Installed){loadBridge();return;}
  const adapter=document.createElement('script');
  adapter.async=false;
  adapter.src='booking-storage-v2.js?v=20260916-2';
  adapter.onload=loadBridge;
  adapter.onerror=()=>console.warn('تعذر تحميل محول الحجوزات v2');
  document.head.appendChild(adapter);
})();
