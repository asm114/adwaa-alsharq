(()=>{
'use strict';
if(window.__adwaaSubscriptionOfficialClickFixInstalled)return;
window.__adwaaSubscriptionOfficialClickFixInstalled=true;

function selectedDatesFromSummary(){
  const root=document.getElementById('selectedDays');
  if(!root)return[];
  return[...root.querySelectorAll('.selected-chip button')]
    .map(el=>String(el.getAttribute('onclick')||'').match(/'(\d{4}-\d{2}-\d{2})'/)?.[1])
    .filter(Boolean)
    .sort();
}
function selectedCustomer(){
  const option=document.querySelector('#subCustomer option:checked');
  return{phone:String(option?.dataset.phone||''),name:String(option?.dataset.name||'')};
}
function sameDates(a,b){
  const x=[...(a||[])].sort(),y=[...(b||[])].sort();
  return x.length===y.length&&x.every((v,i)=>v===y[i]);
}
function existingOfficial(dates,phone){
  return(window.db?.subscriptions||[]).find(s=>s?.paymentManaged&&String(s.phone||'')===phone&&sameDates(s.dates,dates));
}
function existingDraft(dates,phone){
  const now=Date.now();
  return(window.db?.subscriptionDrafts||[]).find(d=>String(d.phone||'')===phone&&sameDates(d.dates,dates)&&d.status==='holding'&&new Date(d.expiresAt||0).getTime()>now);
}
function forceCloseSubscription(){
  const modal=document.getElementById('subscriptionModal');
  if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
  document.body?.classList.remove('modal-open','no-scroll');
  document.documentElement?.classList.remove('modal-open','no-scroll');
}
function bridgeCrossMonthSelections(){
  const calendar=document.getElementById('subscriptionCalendar');
  const selectedRoot=document.getElementById('selectedDays');
  if(!calendar||!selectedRoot)return()=>{};
  const visible=new Set([...calendar.querySelectorAll('.subscription-day.selected')].map(el=>String(el.getAttribute('onclick')||'').match(/'(\d{4}-\d{2}-\d{2})'/)?.[1]).filter(Boolean));
  const allSelected=selectedDatesFromSummary(),added=[];
  for(const date of allSelected){
    if(visible.has(date))continue;
    const ghost=document.createElement('button');
    ghost.type='button';ghost.className='subscription-day selected';
    ghost.setAttribute('onclick',`toggleSubscriptionDate('${date}')`);
    ghost.dataset.crossMonthSelectionBridge='1';ghost.style.display='none';
    calendar.appendChild(ghost);added.push(ghost);
  }
  return()=>added.forEach(el=>el.remove());
}
function unlock(button){
  button.disabled=false;
  delete button.dataset.subscriptionSubmitting;
}
function runOnlyThisHandler(button,event){
  const handler=button.onclick;if(typeof handler!=='function')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.dataset.subscriptionSubmitting==='1')return;

  const dates=selectedDatesFromSummary(),customer=selectedCustomer();
  if(button.id==='subConfirm'){
    const prior=existingOfficial(dates,customer.phone);
    if(prior){alert(`هذا الاشتراك محفوظ مسبقًا باسم ${prior.name||customer.name||'العميل'}. لن يتم إنشاء نسخة مكررة.`);forceCloseSubscription();return}
  }else if(button.id==='saveSubscriptionDraft'){
    if(existingDraft(dates,customer.phone)){alert('هذه الأيام محفوظة مسبقًا كحجز مبدئي لنفس العميل.');forceCloseSubscription();return}
  }

  button.dataset.subscriptionSubmitting='1';button.disabled=true;
  const cleanup=bridgeCrossMonthSelections();
  let settled=false;
  const finish=(saved)=>{if(settled)return;settled=true;cleanup();unlock(button);if(saved)forceCloseSubscription()};
  const watchdog=setTimeout(()=>{
    const saved=button.id==='subConfirm'&&!!existingOfficial(dates,customer.phone);
    finish(saved);
  },8000);
  try{
    const result=handler.call(button,event);
    cleanup();
    if(result&&typeof result.then==='function'){
      result.then(value=>{clearTimeout(watchdog);const saved=value===true||(button.id==='subConfirm'&&!!existingOfficial(dates,customer.phone));finish(saved)}).catch(error=>{
        clearTimeout(watchdog);
        const saved=button.id==='subConfirm'&&!!existingOfficial(dates,customer.phone);
        console.error('تعذر إكمال مزامنة الاشتراك',error);
        finish(saved);
        if(!saved)alert('تعذر حفظ الاشتراك. حاول مرة أخرى.');
      });
    }else{
      clearTimeout(watchdog);finish(button.id==='subConfirm'&&!!existingOfficial(dates,customer.phone));
    }
  }catch(error){
    clearTimeout(watchdog);
    const saved=button.id==='subConfirm'&&!!existingOfficial(dates,customer.phone);
    console.error('تعذر إكمال حفظ الاشتراك',error);
    finish(saved);
    if(!saved)alert('تعذر حفظ الاشتراك. حاول مرة أخرى.');
  }
}

document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#subConfirm,#saveSubscriptionDraft');
  if(!button)return;
  if(button.id==='subConfirm'&&button.dataset.safeSubscriptionOfficial!=='1')return;
  runOnlyThisHandler(button,event);
},true);
})();
