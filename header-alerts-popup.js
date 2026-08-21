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

function movementRows(){
  if(typeof window.getDueOperationalMovements!=='function')return null;
  try{return window.getDueOperationalMovements()||[]}catch(error){console.warn('تعذر قراءة حركات الدخول والخروج',error);return[]}
}
function movementSummaryCard(root){
  return [...root.querySelectorAll('.action-alert')].find(card=>!card.dataset.operationalMovement&&/حركة دخول أو خروج اليوم/.test(String(card.querySelector('h3')?.textContent||'')));
}
function movementActionCard(summary,row){
  const booking=row?.booking||{},entry=row?.type==='entry',card=summary.cloneNode(true),title=card.querySelector('h3'),text=card.querySelector('p'),button=card.querySelector('button');
  card.dataset.operationalMovement='1';
  card.dataset.bookingId=String(booking.id||'');
  card.dataset.movementType=entry?'entry':'exit';
  if(title)title.textContent=`${entry?'تأكيد دخول':'تأكيد خروج'} ${booking.name||'العميل'}`;
  if(text)text.textContent=`#${booking.code||'-'} • ${entry?'موعد الدخول 3:30 م':'وصل موعد الخروج'} — حدّث الحالة من هنا مباشرة.`;
  if(button){
    const target=entry?'تم الدخول':'تم الخروج';
    button.textContent=entry?'نعم، دخل العميل':'نعم، خرج العميل';
    button.removeAttribute('onclick');
    button.setAttribute('onclick',`window.confirmOperationalMovement(${JSON.stringify(String(booking.id||''))},${JSON.stringify(target)})`);
    button.setAttribute('aria-label',`${entry?'تأكيد دخول':'تأكيد خروج'} ${booking.name||'العميل'}`);
  }
  return card;
}
function enhanceMovementAlerts(){
  const root=document.getElementById('alertsList');if(!root)return;
  const summary=movementSummaryCard(root);if(!summary)return;
  const rows=movementRows();if(rows===null)return;
  if(!rows.length){summary.remove();return}
  rows.forEach(row=>summary.before(movementActionCard(summary,row)));
  summary.remove();
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

function refreshAlertPresentation(){
  removeContractAlerts();
  enhanceMovementAlerts();
  syncHeaderAlertCount();
}

function installAlertCountSync(){
  const root=document.getElementById('alertsList');
  if(!root){setTimeout(installAlertCountSync,120);return}
  if(root.__adwaaHeaderAlertCountObserver){refreshAlertPresentation();return}
  const observer=new MutationObserver(()=>queueMicrotask(refreshAlertPresentation));
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
  root.__adwaaHeaderAlertCountObserver=observer;
  refreshAlertPresentation();
}

function wrapRenderAlerts(){
  const current=window.renderAlerts;
  if(typeof current!=='function'){setTimeout(wrapRenderAlerts,120);return}
  if(current.__adwaaHeaderAlertCountWrapped){refreshAlertPresentation();return}
  const wrapped=function(...args){
    const result=current.apply(this,args);
    refreshAlertPresentation();
    queueMicrotask(syncHeaderAlertCount);
    return result;
  };
  wrapped.__adwaaHeaderAlertCountWrapped=true;
  wrapped.__base=current;
  window.renderAlerts=wrapped;
  try{renderAlerts=wrapped}catch(_){}
  refreshAlertPresentation();
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
  refreshAlertPresentation();
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
window.addEventListener('adwaa-operational-reminders-ready',()=>queueMicrotask(refreshAlertPresentation));
function install(){installAlertCountSync();wrapRenderAlerts();refreshAlertPresentation();setTimeout(refreshAlertPresentation,350);setTimeout(refreshAlertPresentation,900);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
