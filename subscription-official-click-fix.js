(()=>{
'use strict';
if(window.__adwaaSubscriptionOfficialClickFixInstalled)return;
window.__adwaaSubscriptionOfficialClickFixInstalled=true;

document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#subConfirm');
  if(!button||button.dataset.safeSubscriptionOfficial!=='1')return;
  const handler=button.onclick;
  if(typeof handler!=='function')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try{
    const result=handler.call(button,event);
    if(result&&typeof result.catch==='function')result.catch(error=>{
      console.error('تعذر اعتماد الاشتراك',error);
      alert('تعذر اعتماد الاشتراك. حاول مرة أخرى.');
    });
  }catch(error){
    console.error('تعذر اعتماد الاشتراك',error);
    alert('تعذر اعتماد الاشتراك. حاول مرة أخرى.');
  }
},true);
})();
