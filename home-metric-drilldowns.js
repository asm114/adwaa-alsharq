(()=>{
'use strict';
if(window.__adwaaHomeMetricDrilldownsInstalled)return;
window.__adwaaHomeMetricDrilldownsInstalled=true;

const METRIC_IDS=['sMonth','sUpcoming','sDue','sRevenueMonth','sTotal','sToday','sWeek','sRevenueToday','sPending','sCommission','sPaid','sFullyPaid'];

function safe(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]))}
function moneyText(value){if(typeof money==='function')return money(Number(value||0));return `${new Intl.NumberFormat('ar-SA').format(Number(value||0))} ر.س`}
function todayIso(){if(typeof isoToday==='function')return isoToday();const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
function dateIso(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function activeBookings(){if(typeof db==='undefined'||!Array.isArray(db?.bookings))return [];return db.bookings.filter(b=>b.status!=='ملغي'&&b.recordType!=='family')}
function remainingAmount(booking){if(typeof getRemainingAmount==='function')return Math.max(0,Number(getRemainingAmount(booking)||0));return Math.max(0,Number(booking?.total||0)-Number(booking?.paid||0))}
function fullyPaid(booking){if(typeof isFullyPaid==='function')return !!isFullyPaid(booking);const total=Number(booking?.total||0),paid=Number(booking?.paid||0);return total>0&&paid>=total}
function commissionAmount(booking){if(typeof managerCommissionAmount==='function')return Math.max(0,Number(managerCommissionAmount(booking)||0));return Math.max(0,Number(booking?.commissionSnapshot?.amount||0))}
function commissionState(booking){if(typeof commissionStatus==='function')return commissionStatus(booking);return booking?.commissionSnapshot?.status||''}

function periods(){
  const today=todayIso();
  const now=new Date(`${today}T00:00:00`);
  const day=(now.getDay()+6)%7;
  const weekStart=new Date(now);weekStart.setDate(now.getDate()-day);
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
  return {today,monthKey:today.slice(0,7),weekStart:dateIso(weekStart),weekEnd:dateIso(weekEnd)};
}
function sortByDateAsc(list){return [...list].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.code||'').localeCompare(String(b.code||'')))}
function sortByDateDesc(list){return [...list].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.code||'').localeCompare(String(a.code||'')))}
function currentUpcoming(active,today){
  if(typeof upcoming==='function'){
    try{return (upcoming()||[]).filter(b=>b&&b.status!=='ملغي'&&b.recordType!=='family')}catch{}
  }
  return sortByDateAsc(active.filter(b=>String(b.date||'')>=today&&!['تم الخروج'].includes(b.status)));
}

function metricDefinition(id){
  const active=activeBookings(),p=periods();
  const month=active.filter(b=>String(b.date||'').slice(0,7)===p.monthKey);
  const today=active.filter(b=>b.date===p.today);
  const week=active.filter(b=>b.date>=p.weekStart&&b.date<=p.weekEnd);
  const upcomingList=currentUpcoming(active,p.today);
  const withDue=active.filter(b=>remainingAmount(b)>0);
  const withSimpleDue=active.filter(b=>Math.max(0,Number(b.total||0)-Number(b.paid||0))>0);
  const paid=active.filter(b=>Number(b.paid||0)>0);
  const earnedCommission=active.filter(b=>commissionState(b)==='earned'&&commissionAmount(b)>0);
  const defs={
    sMonth:{title:'حجوزات الشهر',note:'الحجوزات غير الملغاة المسجلة بتاريخ هذا الشهر.',items:sortByDateDesc(month),mode:'booking'},
    sUpcoming:{title:'الحجوزات القادمة',note:'الحجوزات القادمة التي ما زالت ضمن التشغيل.',items:sortByDateAsc(upcomingList),mode:'upcoming'},
    sDue:{title:'إجمالي المتبقي',note:'الحجوزات التي عليها مبلغ متبقٍ حاليًا.',items:sortByDateAsc(withSimpleDue),mode:'due-simple'},
    sRevenueMonth:{title:'إيراد الشهر',note:'تفصيل المبلغ الظاهر حسب المبالغ المستلمة في حجوزات هذا الشهر.',items:sortByDateDesc(month.filter(b=>Number(b.paid||0)>0)),mode:'paid'},
    sTotal:{title:'إجمالي الحجوزات',note:'كل الحجوزات غير الملغاة للعملاء.',items:sortByDateDesc(active),mode:'booking'},
    sToday:{title:'حجوزات اليوم',note:'الحجوزات المسجلة بتاريخ اليوم.',items:sortByDateAsc(today),mode:'booking'},
    sWeek:{title:'حجوزات الأسبوع',note:'الحجوزات من بداية الأسبوع الحالي إلى نهايته.',items:sortByDateAsc(week),mode:'booking'},
    sRevenueToday:{title:'إيرادات اليوم',note:'المبالغ المستلمة في الحجوزات المسجلة بتاريخ اليوم.',items:sortByDateDesc(today.filter(b=>Number(b.paid||0)>0)),mode:'paid'},
    sPending:{title:'المبالغ المعلقة',note:'تفصيل المبالغ المتبقية التي يتابعها النظام حاليًا.',items:sortByDateAsc(withDue),mode:'due'},
    sCommission:{title:'العمولات المستحقة',note:'الحجوزات التي استحقت عليها عمولة ولم تُسجل كمستلمة بعد.',items:sortByDateDesc(earnedCommission),mode:'commission'},
    sPaid:{title:'إجمالي المحصل',note:'تفصيل كل المبالغ المسجلة كمستلمة في الحجوزات غير الملغاة.',items:sortByDateDesc(paid),mode:'paid'},
    sFullyPaid:{title:'مكتملة السداد',note:'الحجوزات التي اكتمل سدادها.',items:sortByDateDesc(active.filter(fullyPaid)),mode:'booking'}
  };
  return defs[id]||null;
}

function amountFor(booking,mode){
  if(mode==='paid')return {label:'المستلم',value:Number(booking.paid||0)};
  if(mode==='due')return {label:'المتبقي',value:remainingAmount(booking)};
  if(mode==='due-simple')return {label:'المتبقي',value:Math.max(0,Number(booking.total||0)-Number(booking.paid||0))};
  if(mode==='commission')return {label:'العمولة',value:commissionAmount(booking)};
  if(mode==='upcoming')return remainingAmount(booking)>0?{label:'المتبقي',value:remainingAmount(booking)}:{label:'الإجمالي',value:Number(booking.total||0)};
  return {label:'الإجمالي',value:Number(booking.total||0)};
}

function ensureModal(){
  let modal=document.getElementById('homeMetricDrilldownModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='homeMetricDrilldownModal';
  modal.className='metric-drilldown-overlay';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`<section class="metric-drilldown-sheet" role="dialog" aria-modal="true" aria-labelledby="metricDrilldownTitle"><div class="metric-drilldown-handle" aria-hidden="true"></div><div class="metric-drilldown-head"><div><h2 id="metricDrilldownTitle"></h2><p id="metricDrilldownNote"></p></div><button type="button" class="metric-drilldown-close" aria-label="إغلاق">×</button></div><div class="metric-drilldown-summary"><span>القيمة الحالية</span><b id="metricDrilldownValue"></b><small id="metricDrilldownCount"></small></div><div id="metricDrilldownList" class="metric-drilldown-list"></div></section>`;
  document.body.appendChild(modal);
  const close=()=>closeModalView();
  modal.querySelector('.metric-drilldown-close').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('open'))close()});
  return modal;
}
function closeModalView(){const modal=document.getElementById('homeMetricDrilldownModal');if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('metric-drilldown-open')}
function openBookingFromDrilldown(id){closeModalView();if(typeof openBooking==='function')openBooking(id)}
window.openBookingFromMetricDrilldown=openBookingFromDrilldown;

function rowHtml(booking,mode){
  const amount=amountFor(booking,mode);
  const payment=`الإجمالي ${moneyText(booking.total)} • المستلم ${moneyText(booking.paid)}`;
  const meta=[booking.date||'-',booking.type||'يومي',booking.status||'غير محدد'].map(safe).join(' • ');
  return `<button type="button" class="metric-drilldown-row" data-booking-id="${safe(booking.id||'')}"><span class="metric-drilldown-main"><strong>${safe(booking.name||'بدون اسم')}</strong><small>#${safe(booking.code||'-')} • ${meta}</small><em>${safe(payment)}</em></span><span class="metric-drilldown-amount"><small>${safe(amount.label)}</small><b class="money">${safe(moneyText(amount.value))}</b></span><span class="metric-drilldown-chevron" aria-hidden="true">‹</span></button>`;
}
function openDrilldown(id){
  const def=metricDefinition(id);if(!def)return;
  const metricValue=document.getElementById(id);
  const modal=ensureModal();
  modal.querySelector('#metricDrilldownTitle').textContent=def.title;
  modal.querySelector('#metricDrilldownNote').textContent=def.note;
  modal.querySelector('#metricDrilldownValue').textContent=metricValue?.textContent?.trim()||'—';
  modal.querySelector('#metricDrilldownCount').textContent=`${def.items.length} ${def.items.length===1?'سجل':'سجلات'}`;
  const list=modal.querySelector('#metricDrilldownList');
  list.innerHTML=def.items.length?def.items.map(b=>rowHtml(b,def.mode)).join(''):'<div class="metric-drilldown-empty">لا توجد سجلات تكوّن هذه القيمة حاليًا.</div>';
  list.querySelectorAll('[data-booking-id]').forEach(row=>row.addEventListener('click',()=>openBookingFromDrilldown(row.dataset.bookingId)));
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('metric-drilldown-open');
  setTimeout(()=>modal.querySelector('.metric-drilldown-close')?.focus({preventScroll:true}),0);
}

function enhanceMetrics(){
  METRIC_IDS.forEach(id=>{
    const value=document.getElementById(id),card=value?.closest('.stat');if(!card||card.dataset.metricDrilldown==='1')return;
    const label=card.querySelector('.k')?.textContent?.trim()||'التفاصيل';
    card.dataset.metricDrilldown='1';card.dataset.metricId=id;card.classList.add('metric-drilldown-trigger');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`عرض تفاصيل ${label}`);
    card.addEventListener('click',event=>{if(event.target.closest('button,a,input,select,textarea,summary'))return;openDrilldown(id)});
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDrilldown(id)}});
  });
}
function initialize(){enhanceMetrics();let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhanceMetrics()})}).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
