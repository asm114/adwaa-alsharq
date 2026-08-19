(()=>{
'use strict';
if(window.__adwaaHeaderAlertsPopupInstalled)return;
window.__adwaaHeaderAlertsPopupInstalled=true;

function currentAlertCards(){
  return [...document.querySelectorAll('#alertsList .action-alert')].filter(card=>!card.hidden&&card.isConnected);
}

function removeContractAlerts(){
  const root=document.getElementById('alertsList');
  if(!root)return;
  root.querySelectorAll('.action-alert').forEach(card=>{
    if(String(card.querySelector('h3')?.textContent||'').trim()==='إرسال العقد للعميل')card.remove();
  });
}

function syncHeaderAlertCount(){
  const badge=document.getElementById('headerAlertCount');
  if(!badge)return;
  const count=currentAlertCards().length;
  const text=String(count);
  if(badge.textContent!==text)badge.textContent=text;
  const hidden=count===0;
  if(badge.hidden!==hidden)badge.hidden=hidden;
}

function installAlertCountSync(){
  const root=document.getElementById('alertsList');
  if(!root){setTimeout(installAlertCountSync,120);return}
  if(root.__adwaaHeaderAlertCountObserver){removeContractAlerts();syncHeaderAlertCount();return}
  const observer=new MutationObserver(()=>queueMicrotask(()=>{removeContractAlerts();syncHeaderAlertCount()}));
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
  root.__adwaaHeaderAlertCountObserver=observer;
  removeContractAlerts();
  syncHeaderAlertCount();
}

function wrapRenderAlerts(){
  const current=window.renderAlerts;
  if(typeof current!=='function'){setTimeout(wrapRenderAlerts,120);return}
  if(current.__adwaaHeaderAlertCountWrapped){removeContractAlerts();syncHeaderAlertCount();return}
  const wrapped=function(...args){
    const result=current.apply(this,args);
    removeContractAlerts();
    queueMicrotask(syncHeaderAlertCount);
    return result;
  };
  wrapped.__adwaaHeaderAlertCountWrapped=true;
  wrapped.__base=current;
  window.renderAlerts=wrapped;
  try{renderAlerts=wrapped}catch(_){}
  removeContractAlerts();
  syncHeaderAlertCount();
}

function ensureModal(){
  let modal=document.getElementById('headerAlertsModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='headerAlertsModal';
  modal.className='modal';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','headerAlertsModalTitle');
  modal.innerHTML=`<div class="sheet" style="max-width:620px;margin:auto">
    <div class="sheet-head"><div><h2 id="headerAlertsModalTitle" style="margin:0">التنبيهات المهمة</h2><div id="headerAlertsModalMeta" class="meta" style="margin-top:5px"></div></div><button class="close" type="button" data-close-header-alerts aria-label="إغلاق">×</button></div>
    <div id="headerAlertsModalList" class="list"></div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close-header-alerts]')?.addEventListener('click',()=>modal.classList.remove('open'));
  modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')});
  modal.querySelector('#headerAlertsModalList')?.addEventListener('click',event=>{if(event.target.closest('button'))setTimeout(()=>modal.classList.remove('open'),0)});
  return modal;
}

function openHeaderAlertsPopup(){
  removeContractAlerts();
  syncHeaderAlertCount();
  const modal=ensureModal();
  const list=modal.querySelector('#headerAlertsModalList');
  const meta=modal.querySelector('#headerAlertsModalMeta');
  const cards=currentAlertCards();
  if(meta)meta.textContent=cards.length?`${cards.length} تنبيه يحتاج انتباهك`:'لا توجد تنبيهات تحتاج إجراءً';
  if(list){
    list.innerHTML='';
    if(!cards.length){
      const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<b>لا توجد تنبيهات مهمة الآن</b><div class="meta" style="margin-top:6px">كل المهام المهمة تحت السيطرة.</div>';list.appendChild(empty);
    }else{
      for(const card of cards){const clone=card.cloneNode(true);clone.style.margin='0 0 10px';list.appendChild(clone)}
    }
  }
  modal.classList.add('open');
  modal.querySelector('[data-close-header-alerts]')?.focus({preventScroll:true});
}

window.focusDashboardAlerts=openHeaderAlertsPopup;
window.openHeaderAlertsPopup=openHeaderAlertsPopup;
window.syncHeaderAlertCount=syncHeaderAlertCount;
function install(){installAlertCountSync();wrapRenderAlerts();removeContractAlerts();setTimeout(removeContractAlerts,250);setTimeout(syncHeaderAlertCount,300);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
