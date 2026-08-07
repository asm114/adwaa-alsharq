(()=>{
'use strict';
if(window.__adwaaSubscriptionOfficialClickFixInstalled)return;
window.__adwaaSubscriptionOfficialClickFixInstalled=true;

function bridgeCrossMonthSelections(){
  const calendar=document.getElementById('subscriptionCalendar');
  const selectedRoot=document.getElementById('selectedDays');
  if(!calendar||!selectedRoot)return()=>{};

  const visible=new Set(
    [...calendar.querySelectorAll('.subscription-day.selected')]
      .map(el=>String(el.getAttribute('onclick')||'').match(/'(\d{4}-\d{2}-\d{2})'/)?.[1])
      .filter(Boolean)
  );

  const allSelected=[...selectedRoot.querySelectorAll('.selected-chip button')]
    .map(el=>String(el.getAttribute('onclick')||'').match(/'(\d{4}-\d{2}-\d{2})'/)?.[1])
    .filter(Boolean);

  const added=[];
  for(const date of allSelected){
    if(visible.has(date))continue;
    const ghost=document.createElement('button');
    ghost.type='button';
    ghost.className='subscription-day selected';
    ghost.setAttribute('onclick',`toggleSubscriptionDate('${date}')`);
    ghost.dataset.crossMonthSelectionBridge='1';
    ghost.style.display='none';
    calendar.appendChild(ghost);
    added.push(ghost);
  }
  return()=>added.forEach(el=>el.remove());
}

function runOnlyThisHandler(button,event){
  const handler=button.onclick;
  if(typeof handler!=='function')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const cleanup=bridgeCrossMonthSelections();
  try{
    const result=handler.call(button,event);
    cleanup();
    if(result&&typeof result.catch==='function')result.catch(error=>{
      console.error('تعذر حفظ الاشتراك',error);
      alert('تعذر حفظ الاشتراك. حاول مرة أخرى.');
    });
  }catch(error){
    cleanup();
    console.error('تعذر حفظ الاشتراك',error);
    alert('تعذر حفظ الاشتراك. حاول مرة أخرى.');
  }
}

document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#subConfirm,#saveSubscriptionDraft');
  if(!button)return;
  if(button.id==='subConfirm'&&button.dataset.safeSubscriptionOfficial!=='1')return;
  runOnlyThisHandler(button,event);
},true);
})();
