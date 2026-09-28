(()=>{
'use strict';
if(window.__adwaaCommissionVisibilityPolicyInstalled)return;
window.__adwaaCommissionVisibilityPolicyInstalled=true;

const num=v=>Math.max(0,Number(v||0));
const active=b=>b&&b.recordType!=='family'&&!['ملغي','مؤجل'].includes(String(b.status||''));
const fullyPaid=b=>active(b)&&num(b.total)>0&&num(b.paid)>=num(b.total);
const status=b=>typeof window.commissionStatus==='function'?window.commissionStatus(b):(b?.commissionSnapshot?.status||'not_earned');
const amount=b=>{
  const snap=num(b?.commissionSnapshot?.amount);
  if(snap>0)return snap;
  const settings=window.db?.settings||{};
  if(settings.commissionEnabled===false)return 0;
  const method=['per_booking','per_day','percentage'].includes(settings.commissionMethod)?settings.commissionMethod:'per_day';
  const rate=num(settings.commissionRate??100);
  const days=Math.max(1,Number(b?.stayDays||b?.commissionSnapshot?.days||1));
  if(typeof window.calculateCommissionAmount==='function')return num(window.calculateCommissionAmount(method,rate,days,num(b?.total)));
  if(method==='percentage')return Math.round(num(b?.total)*rate)/100;
  if(method==='per_day')return rate*days;
  return rate;
};
const money=v=>typeof window.money==='function'?window.money(v):num(v).toLocaleString('ar-SA')+' ر.س';

function summary(){
  const bookings=(window.db?.bookings||[]).filter(active);
  const outstanding=bookings.filter(b=>fullyPaid(b)&&status(b)==='earned');
  const waiting=bookings.filter(b=>num(b.total)>0&&!fullyPaid(b));
  const received=bookings.filter(b=>['received','received_before_system'].includes(status(b)));
  const endedMissing=bookings.filter(b=>String(b.status||'')==='تم الخروج'&&fullyPaid(b)&&!b.commissionSnapshot);
  return {
    outstanding:outstanding.reduce((s,b)=>s+amount(b),0),
    waiting:waiting.reduce((s,b)=>s+amount(b),0),
    received:received.reduce((s,b)=>s+amount(b),0),
    endedMissing
  };
}
function render(){
  const anchor=document.querySelector('#expenses .finance-summary');
  if(!anchor)return;
  let box=document.getElementById('commissionPolicySummary');
  if(!box){
    box=document.createElement('div');
    box.id='commissionPolicySummary';
    box.className='finance-summary';
    box.style.marginTop='12px';
    anchor.insertAdjacentElement('afterend',box);
  }
  const s=summary();
  box.innerHTML=`
    <div class="finance-card"><small>عمولات مستحقة لي</small><div class="amount status-warning money">${money(s.outstanding)}</div><div class="meta">حجوزات مكتملة السداد ولم تؤكد استلام العمولة.</div></div>
    <div class="finance-card"><small>بانتظار اكتمال السداد</small><div class="amount money">${money(s.waiting)}</div><div class="meta">عمولات متوقعة لحجوزات عليها مبلغ متبقٍ.</div></div>
    <div class="finance-card"><small>عمولات مستلمة / تاريخية</small><div class="amount status-success money">${money(s.received)}</div><div class="meta">محفوظة كما سُجلت ولا يعاد احتسابها.</div></div>
    <div class="finance-card"><small>حجوزات منتهية تحتاج مراجعة</small><div class="amount ${s.endedMissing.length?'status-warning':''}">${s.endedMissing.length}</div><div class="meta">${s.endedMissing.length?'مدفوعة بالكامل ولا يوجد لها سجل عمولة؛ لم نغيّرها تلقائيًا.':'لا توجد حالات ناقصة.'}</div></div>`;
}
function install(){
  if(typeof window.renderExpenses==='function'&&!window.renderExpenses.__commissionPolicyWrapped){
    const base=window.renderExpenses;
    const wrapped=function(...args){const out=base.apply(this,args);render();return out};
    wrapped.__commissionPolicyWrapped=true;wrapped.__base=base;window.renderExpenses=wrapped;
  }
  render();
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));
setTimeout(install,500);
window.addEventListener('adwaa-subscription-updated',render);
})();