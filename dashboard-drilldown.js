(()=>{
'use strict';
if(window.__adwaaDashboardDrilldownInstalled)return;
window.__adwaaDashboardDrilldownInstalled=true;

const norm=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=v=>Number(v||0)||0;
const money=v=>`${num(v).toLocaleString('ar-SA')} ر.س`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function data(){
  try{return (typeof db!=='undefined'&&db)||JSON.parse(localStorage.getItem('adwaaDB')||'{}')||{}}catch(_){return {}}
}
function bookings(){return Array.isArray(data().bookings)?data().bookings:[]}
function totalOf(b){return num(b.total??b.amount??b.bookingTotal??b.totalAmount)}
function paidOf(b){return num(b.paid??b.deposit??b.paidAmount??b.received??b.amountPaid)}
function dueOf(b){return Math.max(0,totalOf(b)-paidOf(b))}
function statusOf(b){return norm(b.status??b.bookingStatus)}
function nameOf(b){return norm(b.name??b.customerName??b.clientName)||'بدون اسم'}
function phoneOf(b){return norm(b.phone??b.mobile??b.customerPhone)}
function codeOf(b){return norm(b.code??b.bookingCode??b.id)}
function isCancelled(b){return /ملغي|cancel/i.test(statusOf(b))}
function dateValue(b){return b.date??b.checkIn??b.checkin??b.startDate??b.bookingDate??b.arrivalDate??''}
function dateOf(b){const d=new Date(dateValue(b));return Number.isNaN(d.getTime())?null:d}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function inCurrentMonth(d,now){return d&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()}
function inCurrentWeek(d,now){
  if(!d)return false;
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-start.getDay());start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+7);
  return d>=start&&d<end;
}
function isUpcoming(b,now){const d=dateOf(b);if(!d||isCancelled(b))return false;const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return d>=today}
function commissionDue(b){
  const raw=norm(b.commissionStatus??b.commission?.status??b.commissionSnapshot?.status??'');
  if(/مستحقة/.test(raw))return true;
  if(/مستلمة|بدون عمولة|received|none/i.test(raw))return false;
  const snap=b.commissionSnapshot||b.commission||{};
  if(snap.received===true||snap.isReceived===true)return false;
  return num(snap.amount??b.commissionAmount)>0 && paidOf(b)>=totalOf(b) && !isCancelled(b);
}

function metricFor(label){
  const t=norm(label),now=new Date(),all=bookings(),active=all.filter(b=>!isCancelled(b));
  if(/إجمالي الحجوزات/.test(t))return {title:'إجمالي الحجوزات',rows:all,kind:'booking'};
  if(/حجوزات اليوم/.test(t))return {title:'حجوزات اليوم',rows:active.filter(b=>sameDay(dateOf(b),now)),kind:'booking'};
  if(/حجوزات هذا الأسبوع/.test(t))return {title:'حجوزات هذا الأسبوع',rows:active.filter(b=>inCurrentWeek(dateOf(b),now)),kind:'booking'};
  if(/حجوزات هذا الشهر/.test(t))return {title:'حجوزات هذا الشهر',rows:active.filter(b=>inCurrentMonth(dateOf(b),now)),kind:'booking'};
  if(/الحجوزات القادمة/.test(t))return {title:'الحجوزات القادمة',rows:active.filter(b=>isUpcoming(b,now)).sort((a,b)=>(dateOf(a)||0)-(dateOf(b)||0)),kind:'booking'};
  if(/مكتملة السداد/.test(t))return {title:'الحجوزات مكتملة السداد',rows:active.filter(b=>totalOf(b)>0&&paidOf(b)>=totalOf(b)),kind:'booking',amount:b=>paidOf(b)};
  if(/العربون والمبالغ المعلقة|المبالغ المعلقة|إجمالي المتبقي/.test(t))return {title:'العملاء والحجوزات التي عليها مبلغ متبقٍ',rows:active.filter(b=>dueOf(b)>0),kind:'due',amount:b=>dueOf(b)};
  if(/إجمالي المحصل/.test(t))return {title:'المبالغ المحصلة',rows:active.filter(b=>paidOf(b)>0),kind:'paid',amount:b=>paidOf(b)};
  if(/إيرادات اليوم/.test(t))return {title:'إيرادات اليوم — السجلات المساهمة',rows:active.filter(b=>sameDay(dateOf(b),now)&&paidOf(b)>0),kind:'paid',amount:b=>paidOf(b)};
  if(/إيرادات هذا الشهر/.test(t))return {title:'إيرادات هذا الشهر — السجلات المساهمة',rows:active.filter(b=>inCurrentMonth(dateOf(b),now)&&paidOf(b)>0),kind:'paid',amount:b=>paidOf(b)};
  if(/عمولات المدير المستحقة/.test(t))return {title:'عمولات المدير المستحقة',rows:active.filter(commissionDue),kind:'commission',amount:b=>num(b.commissionSnapshot?.amount??b.commission?.amount??b.commissionAmount)};
  return null;
}

function clickNav(label){const nav=document.querySelector('nav');if(!nav)return;const b=[...nav.querySelectorAll('button')].find(x=>norm(x.textContent).includes(label));b?.click()}
function openBookingRecord(b){
  close();
  try{if(typeof openBooking==='function'){openBooking(b.id);return}}catch(_){}
  clickNav('الحجوزات');setTimeout(()=>{const input=document.getElementById('search');if(input){input.value=nameOf(b);input.dispatchEvent(new Event('input',{bubbles:true}))}},50);
}
function formatDate(b){const d=dateOf(b);return d?d.toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}):'بدون تاريخ'}

function ensureModal(){
  let root=document.getElementById('dashboardDrilldown');if(root)return root;
  root=document.createElement('div');root.id='dashboardDrilldown';root.className='dash-dd-overlay';
  root.innerHTML=`<section class="dash-dd-sheet" role="dialog" aria-modal="true"><div class="dash-dd-head"><div><span>تفاصيل الرقم</span><h2 id="dashDdTitle">—</h2><small id="dashDdSummary"></small></div><button id="dashDdClose" type="button" aria-label="إغلاق">×</button></div><div id="dashDdRows" class="dash-dd-rows"></div></section>`;
  document.body.appendChild(root);
  root.addEventListener('click',e=>{if(e.target===root)close()});root.querySelector('#dashDdClose').addEventListener('click',close);
  const style=document.createElement('style');style.textContent=`
  .dash-dd-overlay{position:fixed;inset:0;background:rgba(25,27,38,.42);z-index:120;display:none;align-items:flex-end;justify-content:center;padding:12px}.dash-dd-overlay.open{display:flex}.dash-dd-sheet{width:min(760px,100%);max-height:86vh;overflow:hidden;background:#fff;border-radius:26px 26px 18px 18px;box-shadow:0 28px 80px rgba(31,42,68,.25);display:flex;flex-direction:column}.dash-dd-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #ececf3}.dash-dd-head span{font-size:12px;font-weight:900;color:#6754df}.dash-dd-head h2{margin:4px 0 4px;font-size:21px;color:#202636}.dash-dd-head small{color:#81889a}.dash-dd-head button{border:0;background:#f2f1fb;width:42px;height:42px;border-radius:13px;font-size:24px;color:#5146ad}.dash-dd-rows{overflow:auto;padding:10px}.dash-dd-row{width:100%;border:1px solid #e8e8ef;background:#fff;border-radius:16px;padding:14px;margin-bottom:8px;text-align:right;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;color:#202636}.dash-dd-row:active{background:#faf9ff}.dash-dd-row strong{display:block;font-size:15px}.dash-dd-meta{margin-top:5px;font-size:12px;color:#7f8795;line-height:1.7}.dash-dd-amount{font-weight:900;color:#5146ad;white-space:nowrap}.dash-dd-empty{text-align:center;padding:36px 14px;color:#8b91a0}.home-action-card:after{content:'›';position:absolute;left:14px;bottom:10px;color:#9b92df;font-size:18px;font-weight:900}.home-action-card{position:relative}@media(min-width:700px){.dash-dd-overlay{align-items:center}.dash-dd-sheet{border-radius:26px}}`;
  document.head.appendChild(style);return root;
}
function close(){document.getElementById('dashboardDrilldown')?.classList.remove('open')}

window.openDashboardDrilldown=function(label){
  const metric=metricFor(label);if(!metric)return false;
  const root=ensureModal(),rows=root.querySelector('#dashDdRows');
  root.querySelector('#dashDdTitle').textContent=metric.title;
  const sum=metric.amount?metric.rows.reduce((s,b)=>s+num(metric.amount(b)),0):null;
  root.querySelector('#dashDdSummary').textContent=`${metric.rows.length} سجل${sum!==null?` • ${money(sum)}`:''}`;
  if(!metric.rows.length)rows.innerHTML='<div class="dash-dd-empty">لا توجد سجلات ضمن هذا الرقم حاليًا.</div>';
  else rows.innerHTML=metric.rows.map((b,i)=>`<button class="dash-dd-row" type="button" data-i="${i}"><div><strong>${esc(nameOf(b))}${codeOf(b)?` • ${esc(codeOf(b))}`:''}</strong><div class="dash-dd-meta">${esc(formatDate(b))}${phoneOf(b)?` • ${esc(phoneOf(b))}`:''} • ${esc(statusOf(b)||'بدون حالة')}<br>الإجمالي ${money(totalOf(b))} • المدفوع ${money(paidOf(b))} • المتبقي ${money(dueOf(b))}</div></div>${metric.amount?`<div class="dash-dd-amount">${money(metric.amount(b))}</div>`:''}</button>`).join('');
  [...rows.querySelectorAll('.dash-dd-row')].forEach(btn=>btn.addEventListener('click',()=>openBookingRecord(metric.rows[Number(btn.dataset.i)])));
  root.classList.add('open');return true;
};
})();
