(()=>{
'use strict';
if(window.__adwaaSubscriptionRevenueIntegrationInstalled)return;
window.__adwaaSubscriptionRevenueIntegrationInstalled=true;

const num=value=>Math.max(0,Number(value||0)||0);
const money=value=>typeof window.money==='function'?window.money(value):`${num(value).toLocaleString('ar-SA')} ر.س`;
const normDate=value=>{
  if(!value)return'';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const monthKey=value=>normDate(value).slice(0,7);

function data(){return window.db||null}
function subscriptions(){return Array.isArray(data()?.subscriptions)?data().subscriptions:[]}
function bookings(){return Array.isArray(data()?.bookings)?data().bookings:[]}
function isCancelled(row){return /ملغي|cancel/i.test(String(row?.status||''))}
function managedSubscriptions(){return subscriptions().filter(row=>row?.paymentManaged===true&&!isCancelled(row))}
function managedIds(){return new Set(managedSubscriptions().map(row=>row.id).filter(Boolean))}
function isManagedVisit(row,ids=managedIds()){
  return !!(row&&(row.subscriptionPaymentManaged===true||(row.subscriptionId&&ids.has(row.subscriptionId))));
}
function ordinaryActiveBookings(){
  const ids=managedIds();
  return bookings().filter(row=>row?.recordType!=='family'&&!isCancelled(row)&&!isManagedVisit(row,ids));
}
function paymentRows(sub){
  const history=Array.isArray(sub?.paymentHistory)?sub.paymentHistory:[];
  const rows=history.map(row=>({subscription:sub,amount:num(row?.amount),date:row?.date||row?.createdAt||sub?.createdAt||sub?.updatedAt||'',method:row?.method||'غير محدد'})).filter(row=>row.amount>0);
  const recorded=rows.reduce((sum,row)=>sum+row.amount,0),paid=num(sub?.paid);
  if(paid>recorded){
    rows.push({subscription:sub,amount:paid-recorded,date:sub?.updatedAt||sub?.createdAt||'',method:'غير محدد',fallback:true});
  }
  return rows;
}
function allSubscriptionPayments(){return managedSubscriptions().flatMap(paymentRows)}
function subscriptionPaidTotal(){return managedSubscriptions().reduce((sum,row)=>sum+num(row.paid),0)}
function subscriptionTotalValue(){return managedSubscriptions().reduce((sum,row)=>sum+num(row.total),0)}
function todayIso(){
  if(typeof window.isoToday==='function')return window.isoToday();
  return normDate(new Date());
}
function ordinaryPaidTotal(rows=ordinaryActiveBookings()){return rows.reduce((sum,row)=>sum+num(row.paid),0)}
function ordinaryTotalValue(rows=ordinaryActiveBookings()){return rows.reduce((sum,row)=>sum+num(row.total),0)}
function paymentTotalForDate(predicate){return allSubscriptionPayments().filter(row=>predicate(normDate(row.date))).reduce((sum,row)=>sum+row.amount,0)}
function ordinaryRevenueForDate(rows,predicate){return rows.filter(row=>predicate(normDate(row.date))).reduce((sum,row)=>sum+num(row.paid),0)}
function setMoney(id,value){const el=document.getElementById(id);if(el)el.textContent=money(value)}

function refreshDashboardFinance(){
  const rows=ordinaryActiveBookings(),today=todayIso(),month=today.slice(0,7);
  const paid=ordinaryPaidTotal(rows)+subscriptionPaidTotal();
  const total=ordinaryTotalValue(rows)+subscriptionTotalValue();
  const revenueToday=ordinaryRevenueForDate(rows,date=>date===today)+paymentTotalForDate(date=>date===today);
  const revenueMonth=ordinaryRevenueForDate(rows,date=>date.slice(0,7)===month)+paymentTotalForDate(date=>date.slice(0,7)===month);
  setMoney('sRevenueToday',revenueToday);
  setMoney('sRevenueMonth',revenueMonth);
  setMoney('sPaid',paid);
  setMoney('sDue',Math.max(0,total-paid));
  setMoney('sPending',Math.max(0,total-paid));
}

function periodMatch(value,period){
  if(typeof window.financeDateMatch==='function'){
    try{return !!window.financeDateMatch(normDate(value),period)}catch(_){ }
  }
  const date=normDate(value),today=todayIso();
  if(period==='today')return date===today;
  if(period==='month')return date.slice(0,7)===today.slice(0,7);
  if(period==='year')return date.slice(0,4)===today.slice(0,4);
  return true;
}
function refreshFinanceView(){
  const revenueEl=document.getElementById('finRevenue');if(!revenueEl)return;
  const period=document.getElementById('financePeriod')?.value||'month';
  const ordinary=ordinaryActiveBookings().filter(row=>periodMatch(row.date,period));
  const ordinaryRevenue=ordinary.reduce((sum,row)=>sum+num(row.paid),0);
  const subscriptionRevenue=allSubscriptionPayments().filter(row=>periodMatch(row.date,period)).reduce((sum,row)=>sum+row.amount,0);
  const revenue=ordinaryRevenue+subscriptionRevenue;
  setMoney('finRevenue',revenue);

  const expenses=(Array.isArray(data()?.expenses)?data().expenses:[]).filter(row=>periodMatch(row.date,period)).reduce((sum,row)=>sum+num(row.amount),0);
  const commissionReceived=bookings().filter(row=>periodMatch(row.date,period)).reduce((sum,row)=>{
    const status=String(row?.commissionStatus??row?.commission?.status??row?.commissionSnapshot?.status??'');
    if(!/مستلمة|received/i.test(status)&&row?.commissionSnapshot?.received!==true&&row?.commission?.received!==true)return sum;
    return sum+num(row?.commissionSnapshot?.amount??row?.commission?.amount??row?.commissionAmount);
  },0);
  const profit=revenue-expenses-commissionReceived;
  const profitEl=document.getElementById('finProfit');
  if(profitEl){profitEl.textContent=money(profit);profitEl.className='amount '+(profit>=0?'finance-positive':'finance-negative')}
}

function wrap(name,after){
  const current=window[name];
  if(typeof current!=='function'||current.__subscriptionRevenueWrapped)return false;
  const wrapped=function(...args){const result=current.apply(this,args);try{after()}catch(error){console.warn('تعذر تحديث مالية الاشتراك',error)}return result};
  wrapped.__subscriptionRevenueWrapped=true;wrapped.__original=current;window[name]=wrapped;return true;
}
function refresh(){refreshDashboardFinance();refreshFinanceView()}
function install(){
  wrap('renderDashboard',refreshDashboardFinance);
  wrap('renderExpenses',refreshFinanceView);
  wrap('renderAll',refresh);
  refresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,500);setTimeout(install,1500);
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(refresh,0));
})();
