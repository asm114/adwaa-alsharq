(()=>{
'use strict';
if(window.__adwaaCustomerDirectoryTrialInstalled)return;
window.__adwaaCustomerDirectoryTrialInstalled=true;

function enhanceCustomerRows(){
  const root=document.getElementById('customerList');
  if(!root)return;
  [...root.children].forEach(card=>{
    if(card.dataset.directoryEnhanced==='1')return;
    const primary=[...card.querySelectorAll('button')].find(button=>String(button.textContent||'').includes('فتح سجل العميل'));
    const title=card.querySelector('h4');
    if(!primary||!title)return;
    card.dataset.directoryEnhanced='1';
    card.classList.add('customer-directory-row');
    card.tabIndex=0;
    card.setAttribute('role','button');
    card.setAttribute('aria-label',`فتح سجل ${String(title.childNodes[0]?.textContent||title.textContent||'العميل').trim()}`);
    const arrow=document.createElement('span');
    arrow.className='customer-directory-arrow';
    arrow.setAttribute('aria-hidden','true');
    arrow.textContent='‹';
    card.appendChild(arrow);
    card.addEventListener('click',event=>{
      if(event.target.closest('button,a,input,select,textarea'))return;
      primary.click();
    });
    card.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();primary.click()}
    });
  });
}

function apply(){
  if(document.body.classList.contains('simple-view-customers'))enhanceCustomerRows();
}

function initialize(){
  apply();
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply()});
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',()=>setTimeout(apply,20),true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
