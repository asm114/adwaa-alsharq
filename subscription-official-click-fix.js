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
function snapshotState(){
  const db=window.db||{};
  return{
    subscriptionsLength:Array.isArray(db.subscriptions)?db.subscriptions.length:0,
    bookingsLength:Array.isArray(db.bookings)?db.bookings.length:0,
    draftsLength:Array.isArray(db.subscriptionDrafts)?db.subscriptionDrafts.length:0,
    seq:db.seq
  };
}
function rollbackState(snapshot){
  const db=window.db;if(!db)return;
  if(Array.isArray(db.subscriptions)&&db.subscriptions.length>snapshot.subscriptionsLength)db.subscriptions.splice(snapshot.subscriptionsLength);
  if(Array.isArray(db.bookings)&&db.bookings.length>snapshot.bookingsLength)db.bookings.splice(snapshot.bookingsLength);
  if(Array.isArray(db.subscriptionDrafts)&&db.subscriptionDrafts.length>snapshot.draftsLength)db.subscriptionDrafts.splice(snapshot.draftsLength);
  db.seq=snapshot.seq;
  window.renderAll?.();window.renderCustomers?.();
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

  const snapshot=snapshotState();
  button.dataset.subscriptionSubmitting='1';button.disabled=true;
  const cleanup=bridgeCrossMonthSelections();
  let settled=false;
  const finish=(saved)=>{if(settled)return;settled=true;cleanup();unlock(button);if(saved)forceCloseSubscription()};
  try{
    const result=handler.call(button,event);
    cleanup();
    if(result&&typeof result.then==='function'){
      result.then(value=>{
        const saved=value===true||(button.id==='saveSubscriptionDraft'&&window.db?.subscriptionDrafts?.length>snapshot.draftsLength);
        finish(saved);
      }).catch(error=>{
        console.error('فشل حفظ/مزامنة الاشتراك، تم التراجع عن العملية المحلية',error);
        rollbackState(snapshot);
        finish(false);
        alert('لم يكتمل تأكيد الحجز بسبب فشل المزامنة، ولم يتم اعتماد نسخة جديدة. تحقق من الاتصال ثم حاول مرة أخرى.');
      });
    }else{
      const saved=button.id==='subConfirm'&&window.db?.subscriptions?.length>snapshot.subscriptionsLength;
      finish(saved);
    }
  }catch(error){
    console.error('فشل تأكيد الاشتراك، تم التراجع عن العملية المحلية',error);
    rollbackState(snapshot);
    finish(false);
    alert('لم يكتمل تأكيد الحجز، ولم يتم اعتماد نسخة جديدة. حاول مرة أخرى بعد التحقق من الاتصال.');
  }
}

document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#subConfirm,#saveSubscriptionDraft');
  if(!button)return;
  if(button.id==='subConfirm'&&button.dataset.safeSubscriptionOfficial!=='1')return;
  runOnlyThisHandler(button,event);
},true);
})();
