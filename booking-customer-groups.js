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
function groupBookings(rows){
  const map=new Map();
  rows.forEach(b=>{
    const key=customerKey(b);if(!key||key==='n:')return;
    if(!map.has(key))map.set(key,{key,name:b.name||'بدون اسم',phone:b.phone||'',rows:[],latest:'',paid:0,total:0});
    const g=map.get(key);g.rows.push(b);g.paid+=Number(b.paid||0);g.total+=Number(b.total||0);
    if(String(b.date||'')>g.latest)g.latest=String(b.date||'');
    if(!g.phone&&b.phone)g.phone=b.phone;
    if((!g.name||g.name==='بدون اسم')&&b.name)g.name=b.name;
  });
  return [...map.values()].sort((a,b)=>b.latest.localeCompare(a.latest));
}
function groupMatchesSearch(group,raw){
  if(!raw)return true;
  const q=String(raw).trim().toLowerCase(),qp=canonicalPhone(raw);
  if(String(group.name||'').toLowerCase().includes(q))return true;
  if(qp&&canonicalPhone(group.phone).includes(qp))return true;
  return group.rows.some(b=>String(b.code||'').toLowerCase().includes(q)||String(b.date||'').includes(q)||String(b.name||'').toLowerCase().includes(q)||(qp&&canonicalPhone(b.phone).includes(qp)));
}
function bookingCompactHTML(b){
  const due=Math.max(0,Number(b.total||0)-Number(b.paid||0));
  const status=esc(b.status||'');
  const payment=Number(b.total||0)>0?(due>0?`متبقي ${amount(due)}`:'مكتمل السداد'):'لم يُحدد المبلغ';
  return `<button type="button" class="customer-group-booking" onclick="openBooking('${esc(b.id)}')">
    <span class="customer-group-booking-main"><b>${esc(b.code||'-')}</b><span>${esc(b.date||'-')} • ${esc(b.type||'يومي')}</span></span>
    <span class="customer-group-booking-side"><span>${status}</span><small>${esc(payment)}</small></span>
  </button>`;
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
  list.innerHTML=groups.map((g,index)=>{
    const due=Math.max(0,g.total-g.paid),autoOpen=!!raw||groups.length===1;
    return `<details class="customer-booking-group" ${autoOpen?'open':''}>
      <summary>
        <span class="customer-booking-group-title"><b>${esc(g.name)}</b><small>${esc(g.phone||'بدون رقم')}</small></span>
        <span class="customer-booking-group-stats"><b>${g.rows.length} ${g.rows.length===1?'حجز':'حجوزات'}</b><small>${due>0?`متبقي ${amount(due)}`:'لا يوجد متبقي'}</small></span>
      </summary>
      <div class="customer-booking-group-list">${g.rows.map(bookingCompactHTML).join('')}</div>
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
.customer-group-booking{width:100%;border:0;border-bottom:1px solid var(--line);background:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:right;color:inherit}
.customer-group-booking:last-child{border-bottom:0}.customer-group-booking-main,.customer-group-booking-side{display:flex;flex-direction:column;gap:4px}
.customer-group-booking-main span,.customer-group-booking-side small{font-size:11px;color:var(--muted)}.customer-group-booking-side{text-align:left;white-space:nowrap}
@media(max-width:620px){.customer-booking-group>summary{padding:12px}.customer-group-booking{padding:11px 12px}.customer-booking-group-title b{font-size:15px}}
`;
  document.head.appendChild(style);
}
function install(){
  installStyles();
  // توحيد الجوال في كل مسارات العملاء القديمة والجديدة.
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
