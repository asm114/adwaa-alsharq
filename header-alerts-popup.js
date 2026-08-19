(()=>{
'use strict';
if(window.__adwaaHeaderAlertsPopupInstalled)return;
window.__adwaaHeaderAlertsPopupInstalled=true;

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

function currentAlertCards(){
  return [...document.querySelectorAll('#alertsList .action-alert')].filter(card=>!card.hidden);
}

function openHeaderAlertsPopup(){
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
})();
