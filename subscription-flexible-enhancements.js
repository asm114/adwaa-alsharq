(()=>{
'use strict';
if(window.__adwaaSubscriptionFlexibleEnhancementsInstalled)return;
window.__adwaaSubscriptionFlexibleEnhancementsInstalled=true;

const DAY_MS=86400000;
const num=value=>Math.max(0,Number(value||0));
const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>`${num(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const parseDate=value=>{const [y,m,d]=String(value||'').split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):null};
const todayStart=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())};

function subscriptions(){return Array.isArray(window.db?.subscriptions)?window.db.subscriptions:[]}
function linkedBookings(subscriptionId){
 return (Array.isArray(window.db?.bookings)?window.db.bookings:[])
  .filter(booking=>booking?.subscriptionId===subscriptionId&&booking.status!=='ملغي');
}
function isConsumedVisit(booking){
 if(!booking)return false;
 if(booking.status==='تم الدخول'||booking.status==='تم الخروج')return true;
 const date=parseDate(booking.date);if(!date)return false;
 return date.getTime()<todayStart().getTime();
}
function visitStats(subscription){
 const rows=linkedBookings(subscription.id),total=Math.max(1,Number(subscription.visits||subscription.dates?.length||rows.length||1));
 const used=rows.filter(isConsumedVisit).length;
 const upcoming=rows.filter(row=>!isConsumedVisit(row)).length;
 return{
  total,
  used:Math.min(total,used),
  upcoming:Math.min(Math.max(0,total-used),upcoming),
  remaining:Math.max(0,total-used),
  unallocated:Math.max(0,total-rows.length),
  linked:rows.length
 };
}
function financialStats(subscription){
 const history=Array.isArray(subscription?.paymentHistory)?subscription.paymentHistory:[];
 const paid=history.length?history.reduce((sum,row)=>sum+num(row?.amount),0):num(subscription?.paid);
 const total=num(subscription?.total);
 return{total,paid:Math.min(total,paid),due:Math.max(0,total-paid)};
}
window.subscriptionVisitStats=visitStats;
window.subscriptionFinancialStats=financialStats;

function upcomingInfo(subscription){
 const today=todayStart();
 const rows=linkedBookings(subscription.id)
  .map(booking=>({booking,date:parseDate(booking.date)}))
  .filter(row=>row.date&&row.date.getTime()>=today.getTime()&&!isConsumedVisit(row.booking))
  .sort((a,b)=>a.date-b.date);
 if(!rows.length)return null;
 return{...rows[0],days:Math.round((rows[0].date.getTime()-today.getTime())/DAY_MS)};
}
function buildAlerts(){
 const alerts=[];
 for(const subscription of subscriptions().filter(row=>row&&row.status!=='cancelled'&&row.status!=='ملغي')){
  const visits=visitStats(subscription),finance=financialStats(subscription),next=upcomingInfo(subscription);
  if(finance.due>0)alerts.push({priority:1,icon:'💰',title:`متبقي مالي على ${subscription.name||'العميل'}`,detail:`${money(finance.due)} من اشتراك قيمته ${money(finance.total)}`});
  if(visits.remaining>0&&visits.remaining<=2)alerts.push({priority:2,icon:'🎟️',title:`زيارات ${subscription.name||'العميل'} قاربت على الانتهاء`,detail:`المتبقي للاستخدام ${visits.remaining} من ${visits.total}`});
  if(next&&next.days<=3)alerts.push({priority:0,icon:'📅',title:`موعد اشتراك قريب: ${subscription.name||'العميل'}`,detail:next.days===0?'الزيارة اليوم':`الزيارة القادمة بعد ${next.days} يوم — ${next.booking.date}`});
 }
 return alerts.sort((a,b)=>a.priority-b.priority);
}
function ensureAlertsPanel(){
 const view=document.getElementById('customersView');if(!view)return null;
 let section=document.getElementById('subscriptionAlertsSection');
 if(section)return section;
 section=document.createElement('div');section.id='subscriptionAlertsSection';section.className='section subscription-alerts-section';
 section.innerHTML='<div class="section-head"><div><h3>🔔 تنبيهات الاشتراكات</h3><div class="meta">تنبيهات محسوبة من الحجوزات المرتبطة وسجل دفعات الاشتراك، بدون عدادات مستقلة.</div></div></div><div id="subscriptionAlertsList" class="subscription-alert-list"></div>';
 const official=document.getElementById('subscriptionOfficialPanel')?.closest('.section');
 if(official)official.parentElement.insertBefore(section,official);else view.appendChild(section);
 return section;
}
function renderAlerts(){
 const section=ensureAlertsPanel();if(!section)return;
 const root=document.getElementById('subscriptionAlertsList');if(!root)return;
 const rows=buildAlerts();
 root.innerHTML=rows.length?rows.slice(0,12).map(row=>`<article class="subscription-alert-item"><span>${row.icon}</span><div><b>${esc(row.title)}</b><small>${esc(row.detail)}</small></div></article>`).join(''):'<div class="empty">لا توجد تنبيهات اشتراكات تحتاج إجراء الآن.</div>';
}
function subscriptionIdFromCard(card){
 const calls=[...card.querySelectorAll('button[onclick]')].map(button=>button.getAttribute('onclick')||'').join(' ');
 return calls.match(/(?:addSubscriptionPayment|transferOfficialSubscriptionToPortal)\('([^']+)'\)/)?.[1]||'';
}
function decorateOfficialCards(){
 const root=document.getElementById('subscriptionOfficialPanel');if(!root)return;
 for(const card of root.querySelectorAll('.draft-card')){
  const id=subscriptionIdFromCard(card),subscription=subscriptions().find(row=>row?.id===id);if(!subscription)continue;
  const visits=visitStats(subscription),finance=financialStats(subscription);
  let grid=card.querySelector('.subscription-derived-grid');
  if(!grid){grid=document.createElement('div');grid.className='subscription-derived-grid';const actions=card.querySelector('.actions');actions?card.insertBefore(grid,actions):card.appendChild(grid)}
  grid.innerHTML=`<div><small>إجمالي الزيارات</small><b>${visits.total}</b></div><div><small>المستخدمة</small><b>${visits.used}</b></div><div><small>القادمة</small><b>${visits.upcoming}</b></div><div class="${visits.remaining<=2&&visits.remaining>0?'warn':''}"><small>المتبقية للاستخدام</small><b>${visits.remaining}</b></div><div><small>غير المجدولة</small><b>${visits.unallocated}</b></div><div class="${finance.due>0?'warn':''}"><small>الرصيد المالي</small><b>${money(finance.due)}</b></div>`;
 }
}
function bookingIdFromChip(chip){return String(chip.getAttribute('onclick')||'').match(/v95BookingDetails\('([^']+)'\)/)?.[1]||''}
function decorateCalendar(){
 const bookings=Array.isArray(window.db?.bookings)?window.db.bookings:[];
 for(const chip of document.querySelectorAll('#calendar .calendar-event-chip')){
  const id=bookingIdFromChip(chip),booking=bookings.find(row=>row?.id===id);if(!booking?.subscriptionId&&!booking?.subscriptionVisit)continue;
  chip.classList.add('subscription-event-chip');
  if(!chip.dataset.subscriptionLabel){chip.dataset.subscriptionLabel='1';chip.title=`اشتراك • ${chip.title||booking.name||'حجز اشتراك'}`}
 }
}
function enhanceFlexibleLabels(){
 const type=document.getElementById('subType');
 if(type){const custom=[...type.options].find(option=>option.value==='custom');if(custom)custom.textContent='مرن — اختر عدد الزيارات'}
 const launch=document.getElementById('subscriptionLaunch');if(launch)launch.textContent='🎟️ اشتراك مرن';
 const title=document.querySelector('#subscriptionModal .sheet-head h2');if(title)title.textContent='🎟️ إنشاء اشتراك مرن';
 const visitsLabel=document.querySelector('label:has(#subVisits) .label');if(visitsLabel)visitsLabel.textContent='عدد الزيارات المتفق عليها';
}
function installStyles(){
 if(document.getElementById('subscriptionFlexibleEnhancementsStyle'))return;
 const style=document.createElement('style');style.id='subscriptionFlexibleEnhancementsStyle';style.textContent=`
 #calendar .calendar-event-chip.subscription-event-chip{background:#6f42c1!important;border-color:#5b34a4!important;color:#fff!important;box-shadow:0 1px 0 rgba(0,0,0,.08)}
 #calendar .calendar-event-chip.subscription-event-chip::before{content:'🎟️ ';font-size:9px}
 .subscription-derived-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}
 .subscription-derived-grid>div{border:1px solid var(--line);border-radius:11px;padding:8px;background:#fff}
 .subscription-derived-grid small,.subscription-derived-grid b{display:block}.subscription-derived-grid .warn{background:#fff8e8;border-color:#e1aa38}
 .subscription-alert-list{display:grid;gap:8px;padding:14px}.subscription-alert-item{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:13px;background:#fff;padding:10px}.subscription-alert-item>span{font-size:20px}.subscription-alert-item b,.subscription-alert-item small{display:block}.subscription-alert-item small{color:var(--muted);margin-top:3px}
 @media(max-width:620px){.subscription-derived-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
 `;document.head.appendChild(style);
}
let refreshing=false;
function refresh(){
 if(refreshing)return;refreshing=true;
 try{installStyles();enhanceFlexibleLabels();decorateOfficialCards();decorateCalendar();renderAlerts()}catch(error){console.warn('تعذر تحديث تحسينات الاشتراكات المرنة',error)}finally{refreshing=false}
}
function init(){refresh();setTimeout(refresh,500);setTimeout(refresh,1500);setInterval(refresh,5000)}
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(refresh,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
