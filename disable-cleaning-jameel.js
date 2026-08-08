(()=>{
'use strict';
if(window.__adwaaCleaningJameelDisabled)return;
window.__adwaaCleaningJameelDisabled=true;

const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
const disabled=()=>{};

function disableFunctions(){
  [
    'ensureCleaningTaskForBooking','createCleaningLink','sendCleaningTaskToJameel',
    'sendCleaningTaskById','copyCleaningTaskLink','openCleaningTaskLink',
    'openCleaningTask','saveCleaningTask','completeCleaning','reopenCleaning',
    'deleteCleaningTask','approveCleaning','returnCleaning','renderCleaning'
  ].forEach(name=>{try{window[name]=disabled}catch(_){}});
}

function hideCleaningUi(){
  document.getElementById('cleaning')?.classList.remove('active');
  document.getElementById('cleaning')?.setAttribute('hidden','');
  document.getElementById('cleaningModal')?.setAttribute('hidden','');

  document.querySelectorAll('nav button,.simple-more-item,button,a,.task-actions').forEach(el=>{
    const text=norm(el.textContent);
    const onclick=String(el.getAttribute?.('onclick')||'');
    if(/التنظيف|جميل|بوابة جميل|مهمة تنظيف/.test(text)||/Cleaning|Jameel|cleaner/i.test(onclick)){
      el.style.display='none';
      el.setAttribute?.('aria-hidden','true');
    }
  });
}

function cleanLegacyNotifications(){
  document.querySelectorAll('#notificationList .item').forEach(item=>{
    if(/تنظيف|جميل/.test(norm(item.textContent)))item.style.display='none';
  });
}

function install(){disableFunctions();hideCleaningUi();cleanLegacyNotifications()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
new MutationObserver(()=>{hideCleaningUi();cleanLegacyNotifications()}).observe(document.documentElement,{subtree:true,childList:true});
setInterval(disableFunctions,3000);
})();
