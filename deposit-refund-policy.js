(()=>{
'use strict';
if(window.__adwaaDepositRefundPolicyInstalled)return;
window.__adwaaDepositRefundPolicyInstalled=true;
const POLICY_TEXT='العربون غير مسترد نقدًا، وفي حال إلغاء الحجز يُحفظ كامل مبلغ العربون كرصيد للعميل لاستخدامه في حجز لاحق.';
const RESORT_TEXT='إذا ألغى المنتجع الحجز، يكون للعميل خيار استرجاع المبلغ أو إبقائه رصيدًا.';
function injectPolicy(){
  const host=document.getElementById('depositCancellationCreditBox');
  if(!host||document.getElementById('depositCreditPolicyText'))return;
  const note=document.createElement('div');
  note.id='depositCreditPolicyText';
  note.className='meta';
  note.style.marginTop='8px';
  note.textContent=POLICY_TEXT+' '+RESORT_TEXT;
  host.appendChild(note);
}
function wrapWelcomeMessage(){
  const original=window.welcomeMessageText;
  if(typeof original!=='function'||original.__depositCreditPolicyWrapped)return false;
  const wrapped=function(){
    const text=String(original.apply(this,arguments)||'');
    return text.includes(POLICY_TEXT)?text:text+'\n\n'+POLICY_TEXT;
  };
  wrapped.__depositCreditPolicyWrapped=true;
  wrapped.__original=original;
  window.welcomeMessageText=wrapped;
  return true;
}
function start(){
  injectPolicy();wrapWelcomeMessage();
  let tries=0;const timer=setInterval(()=>{tries++;injectPolicy();wrapWelcomeMessage();if(tries>=20)clearInterval(timer)},250);
}
window.__adwaaDepositPolicy={POLICY_TEXT,RESORT_TEXT};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
