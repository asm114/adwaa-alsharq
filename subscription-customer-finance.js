(()=>{
'use strict';
if(window.__adwaaSubscriptionCustomerFinanceInstalled)return;
window.__adwaaSubscriptionCustomerFinanceInstalled=true;

const num=value=>Math.max(0,Number(value||0));
function phone(value){
  let p=String(value||'').replace(/\D/g,'');
  if(p.startsWith('00'))p=p.slice(2);
  if(p.startsWith('05')&&p.length===10)p='966'+p.slice(1);
  else if(p.startsWith('5')&&p.length===9)p='966'+p;
  return p;
}
function name(value){
  return String(value||'').trim().toLowerCase()
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ');
}
function sameCustomer(entity,customer){
  const ep=phone(entity?.phone),cp=phone(customer?.phone);
  if(ep&&cp)return ep===cp;
  return !!name(entity?.name)&&name(entity?.name)===name(customer?.name);
}
function managedSubscriptionIds(){
  const ids=new Set();
  for(const s of (window.db?.subscriptions||[]))if(s?.paymentManaged===true&&s.id)ids.add(s.id);
  for(const b of (window.db?.bookings||[]))if(b?.subscriptionPaymentManaged&&b.subscriptionId)ids.add(b.subscriptionId);
  return ids;
}
function managedSubscriptionsFor(customer){
  const ids=managedSubscriptionIds();
  return (window.db?.subscriptions||[]).filter(s=>s&&ids.has(s.id)&&sameCustomer(s,customer)&&s.status!=='cancelled'&&s.status!=='ملغي');
}
function recalcCustomer(customer){
  const c={...customer};
  const bookings=Array.isArray(customer?.bookings)?customer.bookings:[];
  const managedIds=managedSubscriptionIds();
  let totalValue=0,totalPaid=0;

  for(const b of bookings){
    const centrallyManaged=!!(b?.subscriptionPaymentManaged||(b?.subscriptionId&&managedIds.has(b.subscriptionId)));
    if(centrallyManaged)continue;
    totalValue+=num(b?.total);totalPaid+=num(b?.paid);
  }

  const subscriptions=managedSubscriptionsFor(customer);
  for(const s of subscriptions){totalValue+=num(s.total);totalPaid+=num(s.paid)}

  c.totalValue=totalValue;
  c.totalPaid=totalPaid;
  c.totalDue=Math.max(0,totalValue-totalPaid);
  c.subscriptionPaid=subscriptions.reduce((sum,s)=>sum+num(s.paid),0);
  c.subscriptionDue=subscriptions.reduce((sum,s)=>sum+Math.max(0,num(s.total)-num(s.paid)),0);
  c.paymentStatus=totalValue<=0?'غير محدد':totalPaid<=0?'غير مدفوع':c.totalDue>0?'مدفوع جزئيًا':'مدفوع بالكامل';
  return c;
}
window.subscriptionFinanceForCustomer=recalcCustomer;

function isManagedSubscriptionVisit(booking,managedIds=managedSubscriptionIds()){
  return !!(booking&&(booking.subscriptionVisit||booking.subscriptionPaymentManaged||(booking.subscriptionId&&managedIds.has(booking.subscriptionId))));
}
function financeLineElement(container){
  if(!container)return null;
  const all=[container,...container.querySelectorAll('*')].filter(el=>{
    const text=String(el.textContent||'').replace(/\s+/g,' ').trim();
    return text.includes('الإجمالي')&&text.includes('المدفوع')&&text.includes('المتبقي');
  });
  all.sort((a,b)=>String(a.textContent||'').length-String(b.textContent||'').length);
  return all[0]||null;
}
function smallestContainerForCode(code){
  const candidates=[...document.querySelectorAll('article,li,.item,.customer-booking,.customer-profile-booking,div')].filter(el=>{
    const text=String(el.textContent||'');
    return text.includes(code)&&text.includes('الإجمالي')&&text.includes('المدفوع')&&text.includes('المتبقي');
  });
  candidates.sort((a,b)=>String(a.textContent||'').length-String(b.textContent||'').length);
  return candidates[0]||null;
}
function decorateSubscriptionVisitAmounts(){
  const managedIds=managedSubscriptionIds();
  for(const booking of (window.db?.bookings||[])){
    if(!isManagedSubscriptionVisit(booking,managedIds)||!booking.code)continue;
    const container=smallestContainerForCode(String(booking.code));if(!container)continue;
    const line=financeLineElement(container);if(!line||line.dataset.subscriptionVisitFinance==='1')continue;
    line.dataset.subscriptionVisitFinance='1';
    line.textContent='🎟️ زيارة ضمن الاشتراك الرئيسي • لا يوجد مبلغ مستقل لهذه الزيارة';
    line.classList.add('subscription-visit-finance-note');
  }
}
function installStyles(){
  if(document.getElementById('subscriptionCustomerFinanceStyles'))return;
  const style=document.createElement('style');style.id='subscriptionCustomerFinanceStyles';
  style.textContent='.subscription-visit-finance-note{color:#315ea8!important;font-weight:800!important}';
  document.head.appendChild(style);
}
function scheduleDecorate(){
  queueMicrotask(decorateSubscriptionVisitAmounts);
  setTimeout(decorateSubscriptionVisitAmounts,120);
}
function wrapRenderer(name){
  const current=window[name];
  if(typeof current!=='function'||current.__subscriptionVisitDisplayWrapped)return false;
  const wrapped=function(...args){const result=current.apply(this,args);scheduleDecorate();return result};
  wrapped.__subscriptionVisitDisplayWrapped=true;wrapped.__original=current;window[name]=wrapped;return true;
}
function install(){
  const current=window.getCustomers;
  if(typeof current==='function'&&!current.__subscriptionFinanceWrapped){
    const wrapped=function(...args){
      const rows=current.apply(this,args);
      return Array.isArray(rows)?rows.map(recalcCustomer):rows;
    };
    wrapped.__subscriptionFinanceWrapped=true;
    wrapped.__originalGetCustomers=current;
    window.getCustomers=wrapped;
  }
  wrapRenderer('renderCustomers');wrapRenderer('openCustomer');wrapRenderer('renderAll');
  installStyles();
  try{window.invalidateCaches?.()}catch(_){ }
  scheduleDecorate();
  return true;
}

function initialize(){
  install();
  try{window.renderCustomers?.()}catch(_){ }
  setTimeout(()=>{install();scheduleDecorate()},600);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
window.addEventListener('adwaa-subscription-updated',()=>{
  try{window.invalidateCaches?.()}catch(_){ }
  queueMicrotask(()=>{install();try{window.renderCustomers?.()}catch(_){ }scheduleDecorate()});
});
})();
