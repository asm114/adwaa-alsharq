(()=>{
'use strict';
if(window.__adwaaBookingCustomerGroupsInstalled)return;
window.__adwaaBookingCustomerGroupsInstalled=true;

const originalNormalizePhone=window.normalizePhone;
const originalRenderBookings=window.renderBookings;

function canonicalPhone(value){
  let p=String(value||'').replace(/\D/g,'');
  if(p.startsWith('00'))p=p.slice(2);
  if(p.startsWith('05')&&p.length===10)p='966'+p.slice(1);
  else if(p.startsWith('5')&&p.length===9)p='966'+p;
  return p;
}
function normalizeName(value){
  return String(value||'')
    .trim().toLowerCase()
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/\s+/g,' ');
}
function customerKey(booking){
  const phone=canonicalPhone(booking?.phone);
  return phone?`p:${phone}`:`n:${normalizeName(booking?.name)}`;
}
function esc(value){
  return typeof window.escapeHtml==='function'?window.escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function amount(value){return typeof window.money==='function'?window.money(value):`${Number(value||0).toLocaleString('ar-SA')} ر.س`}
function subscriptionForBooking(booking){
  if(!booking?.subscriptionId)return null;
  return (window.db?.subscriptions||[]).find(s=>s?.id===booking.subscriptionId)||null;
}
function subscriptionFinance(sub){
  if(typeof window.subscriptionFinancialStats==='function')return window.subscriptionFinancialStats(sub);
  const total=Math.max(0,Number(sub?.total||0)),paid=Math.max(0,Number(sub?.paid||0));
  return {total,paid,due:Math.max(0,total-paid)};
}
function subscriptionStats(sub){
  if(typeof window.subscriptionVisitStats==='function')return window.subscriptionVisitStats(sub);
  const rows=(window.db?.bookings||[]).filter(b=>b?.subscriptionId===sub?.id&&b.status!=='ملغي');
  const total=Math.max(1,Number(sub?.visits||sub?.dates?.length||rows.length||1));
  return {total,used:0,upcoming:rows.length,remaining:total,unallocated:Math.max(0,total-rows.length)};
}
function bookingFinance(booking){
  const managed=!!(booking?.subscriptionPaymentManaged||booking?.subscriptionVisit||booking?.subscriptionId);
  if(managed){
    const sub=subscriptionForBooking(booking);
    const total=Math.max(0,Number(sub?.total??booking?.subscriptionValue??0));
    if(sub){
      const paid=Math.max(0,Number(sub.paid||0));
      return {managed:true,known:true,total,paid,due:Math.max(0,total-paid)};
    }
    return {managed:true,known:false,total,paid:0,due:0};
  }
  const total=Math.max(0,Number(booking?.total||0)),paid=Math.max(0,Number(booking?.paid||0));
  return {managed:false,known:true,total,paid,due:Math.max(0,total-paid)};
}
function groupBookings(rows){
  const map=new Map();
  rows.forEach(b=>{
    const key=customerKey(b);if(!key||key==='n:')return;
    if(!map.has(key))map.set(key,{key,name:b.name||'بدون اسم',phone:b.phone||'',rows:[],latest:''});
    const g=map.get(key);g.rows.push(b);
    if(String(b.date||'')>g.latest)g.latest=String(b.date||'');
    if(!g.phone&&b.phone)g.phone=b.phone;
    if((!g.name||g.name==='بدون اسم')&&b.name)g.name=b.name;
  });
  return [...map.values()].sort((a,b)=>b.latest.localeCompare(a.latest));
}
function groupFinance(group){
  let total=0,paid=0,hasUnknownSubscription=false;
  const countedSubscriptions=new Set();
  for(const b of group.rows){
    const f=bookingFinance(b);
    if(f.managed){
      const key=b.subscriptionId||`legacy:${b.subscriptionValue||0}:${b.name||''}`;
      if(countedSubscriptions.has(key))continue;
      countedSubscriptions.add(key);
      if(f.known){total+=f.total;paid+=f.paid}else hasUnknownSubscription=true;
    }else{
      total+=f.total;paid+=f.paid;
    }
  }
  return {total,paid,due:Math.max(0,total-paid),hasUnknownSubscription};
}
function groupMatchesSearch(group,raw){
  if(!raw)return true;
  const q=String(raw).trim().toLowerCase(),qp=canonicalPhone(raw);
  if(String(group.name||'').toLowerCase().includes(q))return true;
  if(qp&&canonicalPhone(group.phone).includes(qp))return true;
  return group.rows.some(b=>String(b.code||'').toLowerCase().includes(q)||String(b.date||'').includes(q)||String(b.name||'').toLowerCase().includes(q)||(qp&&canonicalPhone(b.phone).includes(qp)));
}
function subscriptionCardsHTML(group){
  const ids=[...new Set(group.rows.map(b=>b?.subscriptionId).filter(Boolean))];
  return ids.map(id=>{
    const sub=(window.db?.subscriptions||[]).find(s=>s?.id===id);if(!sub)return'';
    const f=subscriptionFinance(sub),s=subscriptionStats(sub);
    return `<div class="customer-subscription-main">
      <div class="customer-subscription-main-head">
        <div><b>🎟️ الاشتراك الرئيسي</b><small>${esc(sub.typeLabel||'اشتراك مرن')} • ${s.total} زيارة</small></div>
        <span class="customer-subscription-status ${f.due>0?'due':'paid'}">${f.due>0?'متبقي مالي':'مكتمل السداد'}</span>
      </div>
      <div class="customer-subscription-money"><span>الإجمالي <b>${amount(f.total)}</b></span><span>المدفوع <b>${amount(f.paid)}</b></span><span>المتبقي <b>${amount(f.due)}</b></span></div>
      <div class="customer-subscription-visits"><span>المستخدمة <b>${s.used}</b></span><span>القادمة <b>${s.upcoming}</b></span><span>المتبقية <b>${s.remaining}</b></span></div>
      <button type="button" class="primary customer-subscription-manage" onclick="event.stopPropagation();openSubscriptionControlCenter('${esc(id)}')">⚙️ إدارة الاشتراك</button>
    </div>`;
  }).join('');
}
function bookingCompactHTML(b,index,totalInSubscription){
  const f=bookingFinance(b),status=esc(b.status||''),managed=f.managed;
  let payment='لم يُحدد المبلغ';
  if(managed){
    payment='زيارة مشمولة ضمن الاشتراك الرئيسي';
  }else if(f.total>0){
    payment=f.due>0?`متبقي ${amount(f.due)}`:'مكتمل السداد';
  }
  const visitTitle=managed&&b.subscriptionId?`زيارة ${index+1} من ${totalInSubscription}`:esc(b.code||'-');
  return `<div class="customer-group-booking ${managed?'subscription-visit-booking':''}">
    <button type="button" class="customer-group-booking-open" onclick="openBooking('${esc(b.id)}')" aria-label="فتح الحجز ${esc(b.code||'')}">
      <span class="customer-group-booking-main"><b>${visitTitle}</b><span>${esc(b.date||'-')} • ${managed?'ضمن اشتراك':esc(b.type||'يومي')} ${managed&&b.code?`• ${esc(b.code)}`:''}</span></span>
      <span class="customer-group-booking-side"><span>${status}</span><small>${esc(payment)}</small></span>
    </button>
    <button type="button" class="secondary customer-group-edit" onclick="event.stopPropagation();openBooking('${esc(b.id)}')">${managed?'✏️ تعديل الزيارة':'✏️ تعديل الحجز'}</button>
  </div>`;
}
function groupRowsHTML(group){
  const subTotals=new Map();
  for(const b of group.rows)if(b.subscriptionId)subTotals.set(b.subscriptionId,(subTotals.get(b.subscriptionId)||0)+1);
  const counters=new Map();
  return group.rows.map(b=>{
    if(!b.subscriptionId)return bookingCompactHTML(b,0,0);
    const index=counters.get(b.subscriptionId)||0;counters.set(b.subscriptionId,index+1);
    const sub=subscriptionForBooking(b),total=Math.max(Number(sub?.visits||0),subTotals.get(b.subscriptionId)||0);
    return bookingCompactHTML(b,index,total);
  }).join('');
}
function groupedRenderBookings(){
  const list=document.getElementById('bookingList');
  if(!list){if(typeof originalRenderBookings==='function')return originalRenderBookings();return}
  const searchEl=document.getElementById('search');
  const statusEl=document.getElementById('statusFilter');
  const raw=String(searchEl?.value||'').trim(),status=String(statusEl?.value||'');
  const rows=(window.db?.bookings||[])
    .filter(b=>b&&b.recordType!=='family')
    .filter(b=>(!status||b.status===status))
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const groups=groupBookings(rows).filter(g=>groupMatchesSearch(g,raw));
  list.innerHTML=groups.map(g=>{
    const finance=groupFinance(g),autoOpen=!!raw||groups.length===1;
    const hasSubscription=g.rows.some(b=>b.subscriptionId);
    const financeText=finance.due>0?`متبقي ${amount(finance.due)}`:finance.hasUnknownSubscription?'يوجد اشتراك مرتبط':hasSubscription?'الاشتراك بدون متبقي':'لا يوجد متبقي';
    return `<details class="customer-booking-group" ${autoOpen?'open':''}>
      <summary>
        <span class="customer-booking-group-title"><b>${esc(g.name)}</b><small>${esc(g.phone||'بدون رقم')}</small></span>
        <span class="customer-booking-group-stats"><b>${g.rows.length} ${g.rows.length===1?'حجز':'حجوزات'}</b><small>${esc(financeText)}</small></span>
      </summary>
      <div class="customer-booking-group-list">${subscriptionCardsHTML(g)}${groupRowsHTML(g)}</div>
    </details>`;
  }).join('')||'<div class="empty">لا توجد نتائج</div>';
}
function installStyles(){
  if(document.getElementById('bookingCustomerGroupsStyles'))return;
  const style=document.createElement('style');style.id='bookingCustomerGroupsStyles';style.textContent=`
.customer-booking-group{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-bottom:10px}
.customer-booking-group>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;cursor:pointer}
.customer-booking-group>summary::-webkit-details-marker{display:none}
.customer-booking-group-title,.customer-booking-group-stats{display:flex;flex-direction:column;gap:3px;min-width:0}
.customer-booking-group-title b{font-size:16px}.customer-booking-group-title small,.customer-booking-group-stats small{color:var(--muted);font-size:11px}
.customer-booking-group-stats{text-align:left;white-space:nowrap}.customer-booking-group[open]>summary{border-bottom:1px solid var(--line);background:#faf9ff}
.customer-booking-group-list{display:grid;gap:0}
.customer-subscription-main{margin:10px 12px;padding:13px;border:2px solid #cfc8ff;border-radius:16px;background:#f7f5ff;display:grid;gap:10px}
.customer-subscription-main-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.customer-subscription-main-head>div{display:grid;gap:3px}.customer-subscription-main-head small{color:var(--muted)}
.customer-subscription-status{font-size:11px;font-weight:900;padding:5px 8px;border-radius:999px}.customer-subscription-status.due{background:#fff3d9;color:#7a5900}.customer-subscription-status.paid{background:#e8f6ef;color:#176742}
.customer-subscription-money,.customer-subscription-visits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.customer-subscription-money span,.customer-subscription-visits span{background:#fff;border:1px solid var(--line);border-radius:10px;padding:7px;font-size:11px}.customer-subscription-money b,.customer-subscription-visits b{display:block;margin-top:3px;font-size:13px}
.customer-subscription-manage{width:100%;font-weight:900}.customer-group-booking{border-bottom:1px solid var(--line);background:#fff;padding:10px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}.customer-group-booking.subscription-visit-booking{background:#fcfbff}
.customer-group-booking:last-child{border-bottom:0}
.customer-group-booking-open{width:100%;border:0;background:transparent;padding:2px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:right;color:inherit}
.customer-group-booking-main,.customer-group-booking-side{display:flex;flex-direction:column;gap:4px}.customer-group-booking-main{min-width:0}
.customer-group-booking-main span,.customer-group-booking-side small{font-size:11px;color:var(--muted)}.customer-group-booking-side{text-align:left;white-space:normal;max-width:290px}
.customer-group-edit{white-space:nowrap;padding:8px 10px;font-size:12px}
@media(max-width:620px){.customer-booking-group>summary{padding:12px}.customer-group-booking{grid-template-columns:1fr;padding:10px 11px}.customer-group-booking-title b{font-size:15px}.customer-group-edit{width:100%}.customer-group-booking-side{max-width:180px}.customer-subscription-money,.customer-subscription-visits{grid-template-columns:repeat(3,minmax(0,1fr));font-size:10px}.customer-subscription-main{margin:8px}}
`;
  document.head.appendChild(style);
}
function install(){
  installStyles();
  try{window.normalizePhone=canonicalPhone;window.invalidateCaches?.()}catch(_){ }
  if(typeof window.renderBookings==='function'&&!window.renderBookings.__groupedByCustomer){
    groupedRenderBookings.__groupedByCustomer=true;
    window.renderBookings=groupedRenderBookings;
  }
  const active=document.querySelector('.view.active')?.id;if(active==='bookings')groupedRenderBookings();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,600);
setTimeout(install,1600);
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(()=>window.renderBookings?.(),0));
})();
