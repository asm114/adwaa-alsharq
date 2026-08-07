(()=>{
'use strict';
if(window.__adwaaSubscriptionEditButtonFallbackInstalled)return;
window.__adwaaSubscriptionEditButtonFallbackInstalled=true;

function sortedDrafts(){
  return (Array.isArray(window.db?.subscriptionDrafts)?window.db.subscriptionDrafts:[])
    .slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function sortedOfficial(){
  return (Array.isArray(window.db?.subscriptions)?window.db.subscriptions:[])
    .filter(s=>s?.paymentManaged)
    .slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function makeButton(label,handler){
  const btn=document.createElement('button');
  btn.type='button';btn.className='secondary';btn.dataset.subscriptionEditFallback='1';btn.textContent=label;btn.addEventListener('click',handler);return btn;
}
function installDraftButtons(){
  const cards=[...document.querySelectorAll('#subscriptionDraftPanel .draft-card')],rows=sortedDrafts();
  cards.forEach((card,index)=>{
    const actions=card.querySelector('.actions');if(!actions||actions.querySelector('[data-edit-subscription],[data-subscription-edit-fallback]'))return;
    const row=rows[index];if(!row)return;
    if(row.status==='approved'&&row.subscriptionId){
      actions.prepend(makeButton('✏️ تعديل الاشتراك',()=>window.editOfficialSubscription?.(row.subscriptionId)));
    }else{
      actions.prepend(makeButton('✏️ تعديل',()=>window.editSubscriptionDraft?.(row.id)));
    }
  });
}
function installOfficialButtons(){
  const cards=[...document.querySelectorAll('#subscriptionOfficialPanel .draft-card')],rows=sortedOfficial();
  cards.forEach((card,index)=>{
    const actions=card.querySelector('.actions');if(!actions||actions.querySelector('[data-edit-subscription],[data-subscription-edit-fallback]'))return;
    const row=rows[index];if(!row)return;
    actions.prepend(makeButton('✏️ تعديل الاشتراك',()=>window.editOfficialSubscription?.(row.id)));
  });
}
function install(){installDraftButtons();installOfficialButtons()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
new MutationObserver(()=>install()).observe(document.body,{childList:true,subtree:true});
setInterval(install,1500);
})();
