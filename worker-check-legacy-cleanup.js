(()=>{
'use strict';
if(window.__adwaaWorkerCheckLegacyCleanupInstalled)return;
window.__adwaaWorkerCheckLegacyCleanupInstalled=true;

const textOf=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
const legacyCleaningText=text=>/تنظيف مطلوب|مهمة تنظيف لم تكتمل|فتح التنظيف|التنظيف وجميل|بوابة جميل|مهام التنظيف والمتابعة/.test(String(text||''));

function removeLegacyNavigation(){
  document.querySelectorAll('nav button').forEach(button=>{if(legacyCleaningText(textOf(button)))button.remove()});
  document.querySelectorAll('#simpleMoreOverlay .simple-more-item').forEach(item=>{if(legacyCleaningText(textOf(item)))item.remove()});
}

function removeLegacyHomeCards(){
  const roots=[document.getElementById('dashboard'),document.getElementById('simpleHomeDashboard')].filter(Boolean);
  for(const root of roots){
    root.querySelectorAll('.stat,.item,.section,.action-alert,[class*="today"],[class*="task"]').forEach(node=>{
      if(node.classList?.contains('worker-check-alert')||node.id==='workerCheckBookingPanel')return;
      if(legacyCleaningText(textOf(node)))node.remove();
    });
    root.querySelectorAll('button,a').forEach(control=>{
      if(!legacyCleaningText(textOf(control)))return;
      const card=control.closest('.stat,.item,.section,.action-alert,[class*="today"],[class*="task"]');
      if(card&&!card.classList?.contains('worker-check-alert'))card.remove();else control.remove();
    });
  }
}

function cleanup(){removeLegacyNavigation();removeLegacyHomeCards()}
function start(){
  cleanup();setTimeout(cleanup,250);setTimeout(cleanup,1200);
  const observer=new MutationObserver(()=>queueMicrotask(cleanup));
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),20000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

(()=>{const script=document.createElement('script');script.async=false;script.src='worker-check-delete.js?v=20260819-1';script.onerror=()=>console.warn('تعذر تحميل حذف تشييك العامل');document.head.appendChild(script)})();
