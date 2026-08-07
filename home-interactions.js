(()=>{
'use strict';
if(window.__adwaaHomeInteractionsInstalled)return;
window.__adwaaHomeInteractionsInstalled=true;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();

function removeVoiceControls(){
  document.querySelectorAll('.voice,#voiceHint,[onclick*="startVoice"]').forEach(el=>el.remove());
  try{window.startVoice=()=>{}}catch(_){/* no-op */}
}
function clickNav(label){
  const nav=document.querySelector('nav');if(!nav)return false;
  const btn=[...nav.querySelectorAll('button')].find(b=>norm(b.textContent)===label||norm(b.textContent).includes(label));
  if(btn){btn.click();return true}return false;
}
function fallbackRoute(text){
  const t=norm(text);
  if(/إيرادات|المبالغ|العربون|المتبقي|المحصل|عمولات|مالية/.test(t))return ()=>clickNav('المالية')||clickNav('المصاريف');
  if(/عميل|العملاء/.test(t))return ()=>clickNav('العملاء');
  if(/اليوم|الأسبوع|الشهر|القادمة|الحجوزات|مكتملة السداد/.test(t))return ()=>clickNav('الحجوزات');
  if(/التقويم|تواريخ/.test(t))return ()=>clickNav('التقويم');
  return null;
}
function runCardAction(card){
  const text=card.textContent;
  try{if(typeof window.openDashboardDrilldown==='function'&&window.openDashboardDrilldown(text))return}catch(err){console.warn('تعذر فتح تفاصيل بطاقة الرئيسية',err)}
  fallbackRoute(text)?.();
}
function makeCardActionable(card){
  if(!card||card.dataset.homeActionBound==='1')return;
  if(!fallbackRoute(card.textContent))return;
  card.dataset.homeActionBound='1';card.classList.add('home-action-card');card.setAttribute('role','button');card.setAttribute('tabindex','0');
  card.addEventListener('click',event=>{if(event.target.closest('button,a,input,select,textarea'))return;runCardAction(card)});
  card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();runCardAction(card)}});
}
function bindHomeCards(){
  if(!document.body.classList.contains('simple-view-home'))return;
  document.querySelectorAll('#simpleHomeDashboard .stat,.view.active>.grid .stat').forEach(makeCardActionable);
}
function addStyles(){
  if(document.getElementById('homeInteractionStyles'))return;
  const style=document.createElement('style');style.id='homeInteractionStyles';style.textContent=`
    .home-action-card{cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
    .home-action-card:hover{transform:translateY(-2px);border-color:#cfc8f4!important;box-shadow:0 12px 28px rgba(31,42,68,.09)!important}
    .home-action-card:focus-visible{outline:3px solid rgba(103,84,223,.2);outline-offset:2px}
  `;document.head.appendChild(style);
}
function init(){removeVoiceControls();addStyles();bindHomeCards();setTimeout(()=>{removeVoiceControls();bindHomeCards()},800);setTimeout(()=>{removeVoiceControls();bindHomeCards()},1800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

(()=>{
  if(document.querySelector('script[data-bookings-pdf-report]'))return;
  const script=document.createElement('script');
  script.src='bookings-pdf-report.js?v=20260807-1';
  script.defer=true;
  script.dataset.bookingsPdfReport='1';
  document.head.appendChild(script);
})();
