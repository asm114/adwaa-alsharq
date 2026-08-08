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

  // الحجوزات العادية والاشتراكات القديمة تبقى على حسابها الأصلي.
  for(const b of bookings){
    const centrallyManaged=!!(b?.subscriptionPaymentManaged||(b?.subscriptionId&&managedIds.has(b.subscriptionId)));
    if(centrallyManaged)continue;
    totalValue+=num(b?.total);totalPaid+=num(b?.paid);
  }

  // الاشتراك الحديث يُحسب مرة واحدة فقط مهما كان عدد الزيارات.
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

function install(){
  const current=window.getCustomers;
  if(typeof current!=='function'||current.__subscriptionFinanceWrapped)return false;
  const wrapped=function(...args){
    const rows=current.apply(this,args);
    return Array.isArray(rows)?rows.map(recalcCustomer):rows;
  };
  wrapped.__subscriptionFinanceWrapped=true;
  wrapped.__originalGetCustomers=current;
  window.getCustomers=wrapped;
  try{window.invalidateCaches?.()}catch(_){ }
  try{window.renderCustomers?.()}catch(_){ }
  return true;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,500);
setTimeout(install,1500);
window.addEventListener('adwaa-subscription-updated',()=>{try{window.invalidateCaches?.()}catch(_){ }setTimeout(()=>{install();window.renderCustomers?.()},0)});
})();
