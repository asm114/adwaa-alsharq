(()=>{
'use strict';
if(window.__adwaaWorkerCheckStaleAlertFixInstalled)return;
window.__adwaaWorkerCheckStaleAlertFixInstalled=true;

const state=()=>window.db;
const bookings=()=>Array.isArray(state()?.bookings)?state().bookings:[];
const normalized=value=>String(value||'').trim().toUpperCase();

function bookingFromAlert(card){
  const text=String(card?.textContent||'');
  const match=text.match(/الحجز\s*#?\s*([A-Z]+-\d+)/i);
  if(!match)return null;
  const code=normalized(match[1]);
  return bookings().find(row=>normalized(row?.code)===code)||null;
}
function isShareAlert(card){
  const text=String(card?.textContent||'');
  return /مشاركة\s+تشييك\s+عامل|مشاركة\s+تشييك\s+العامل/.test(text);
}
async function persistDismissal(booking){
  booking.workerCheckDismissedAt=new Date().toISOString();
  try{
    if(typeof window.persist==='function')await window.persist();
    else localStorage.setItem('adwaaDB',JSON.stringify(state()));
  }catch(error){
    console.warn('تعذر حفظ إخفاء تنبيه تشييك العامل.',error);
    throw error;
  }
}
async function dismissAlert(card,booking,button){
  if(!booking)return;
  if(!confirm(`إخفاء تنبيه تشييك العامل للحجز #${booking.code||''} نهائيًا؟`))return;
  if(button){button.disabled=true;button.textContent='جاري الحفظ…'}
  try{
    await persistDismissal(booking);
    card?.remove();
  }catch(_){
    if(button){button.disabled=false;button.textContent='تم التعامل'}
    alert('تعذر حفظ إخفاء التنبيه. حاول مرة أخرى.');
  }
}
function decorateAlerts(){
  document.querySelectorAll('.worker-check-alert').forEach(card=>{
    if(!isShareAlert(card))return;
    const booking=bookingFromAlert(card);
    if(!booking)return;
    if(booking.workerCheckDismissedAt){card.remove();return}
    if(card.querySelector('[data-worker-check-dismiss]'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='secondary';
    button.dataset.workerCheckDismiss='1';
    button.textContent='تم التعامل';
    button.title='إخفاء هذا التنبيه لهذا الحجز';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();dismissAlert(card,booking,button)});
    card.appendChild(button);
  });
}
function start(){
  decorateAlerts();
  const observer=new MutationObserver(()=>queueMicrotask(decorateAlerts));
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('focus',decorateAlerts);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
