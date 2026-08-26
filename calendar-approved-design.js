(()=>{
'use strict';
if(window.__adwaaApprovedCalendarDesignInstalled)return;
window.__adwaaApprovedCalendarDesignInstalled=true;

const SCHOOL_HOLIDAYS=[
  {start:'2026-09-23',end:'2026-09-26',name:'إجازة اليوم الوطني — مدارس',audience:'طلاب المدارس'},
  {start:'2026-11-20',end:'2026-11-28',name:'إجازة الخريف — مدارس',audience:'طلاب المدارس'},
  {start:'2027-01-08',end:'2027-01-16',name:'إجازة منتصف العام — مدارس',audience:'طلاب المدارس'},
  {start:'2027-02-19',end:'2027-02-22',name:'إجازة يوم التأسيس — مدارس',audience:'طلاب المدارس'},
  {start:'2027-02-26',end:'2027-03-13',name:'إجازة عيد الفطر — مدارس',audience:'طلاب المدارس'},
  {start:'2027-05-07',end:'2027-05-22',name:'إجازة عيد الأضحى — مدارس',audience:'طلاب المدارس'},
  {start:'2027-06-24',end:'2027-08-28',name:'إجازة نهاية العام — مدارس',audience:'طلاب المدارس'}
];
const UNIVERSITY_HOLIDAYS=[
  {start:'2026-09-23',end:'2026-09-26',name:'إجازة اليوم الوطني — جامعات حكومية',audience:'الملك سعود، الملك عبدالعزيز، أم القرى، القصيم'},
  {start:'2026-11-20',end:'2026-11-28',name:'إجازة الخريف — جامعات حكومية',audience:'الجامعات الحكومية المرجعية'},
  {start:'2026-12-27',end:'2027-01-16',name:'إجازة منتصف العام — جامعات حكومية',audience:'الجامعات الحكومية المرجعية'},
  {start:'2027-02-21',end:'2027-02-22',name:'إجازة يوم التأسيس — جامعات حكومية',audience:'الجامعات الحكومية المرجعية'},
  {start:'2027-02-14',end:'2027-03-13',name:'إجازة عيد الفطر — جامعات حكومية',audience:'الجامعات الحكومية المرجعية'},
  {start:'2027-04-30',end:'2027-05-22',name:'إجازة عيد الأضحى — جامعات حكومية',audience:'الجامعات الحكومية المرجعية'},
  {start:'2027-06-20',end:'2027-08-28',name:'إجازة نهاية العام — جامعات حكومية',audience:'قد يستمر الفصل الصيفي لبعض الطلاب'}
];
const HIJRI_NUMERIC=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric'});
let approvedPortalSeasons=[];
let seasonLoadStarted=false;

function safe(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]))}
function isoForDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function noon(iso){return new Date(`${iso}T12:00:00`)}
function hijriNumeric(date){const out={};HIJRI_NUMERIC.formatToParts(date).forEach(part=>{if(['year','month','day'].includes(part.type))out[part.type]=Number(part.value)});return out}
function inRange(iso,start,end){return iso>=start&&iso<=end}
function pushUnique(list,event){if(!event?.name)return;const key=`${event.name}|${event.audience||''}`;if(!list.some(x=>`${x.name}|${x.audience||''}`===key))list.push(event)}
function publicFitr(h){return (h.month===9&&h.day>=25)||(h.month===10&&h.day<=5)}
function publicAdha(h){return h.month===12&&h.day>=5&&h.day<=15}
function privateAdha(h){return h.month===12&&h.day>=9&&h.day<=12}
function privateFitr(date,h){
  if(h.month===9&&h.day===30)return true;
  if(h.month!==10||h.day<1||h.day>4)return false;
  const first=new Date(date);first.setDate(first.getDate()-(h.day-1));
  const prev=new Date(first);prev.setDate(prev.getDate()-1);const p=hijriNumeric(prev);
  return h.day<=((p.month===9&&p.day===30)?3:4);
}
function approvedEvents(iso){
  const date=noon(iso);if(Number.isNaN(date.getTime()))return [];
  const list=[],m=date.getMonth()+1,d=date.getDate(),h=hijriNumeric(date);
  if(m===2&&d===22)pushUnique(list,{name:'يوم التأسيس',audience:'قطاع عام وخاص + تعليم'});
  if(m===9&&d===23)pushUnique(list,{name:'اليوم الوطني السعودي',audience:'قطاع عام وخاص + تعليم'});
  if(publicFitr(h))pushUnique(list,{name:'إجازة عيد الفطر — قطاع حكومي',audience:'موظفو القطاع العام'});
  if(privateFitr(date,h))pushUnique(list,{name:'إجازة عيد الفطر — قطاع خاص',audience:'موظفو القطاع الخاص'});
  if(publicAdha(h))pushUnique(list,{name:'إجازة عيد الأضحى — قطاع حكومي',audience:'موظفو القطاع العام'});
  if(privateAdha(h))pushUnique(list,{name:'إجازة عيد الأضحى — قطاع خاص',audience:'موظفو القطاع الخاص'});
  SCHOOL_HOLIDAYS.forEach(e=>{if(inRange(iso,e.start,e.end))pushUnique(list,e)});
  UNIVERSITY_HOLIDAYS.forEach(e=>{if(inRange(iso,e.start,e.end))pushUnique(list,e)});
  return list;
}
window.getApprovedSaudiCalendarEvents=approvedEvents;

function activeSeason(iso){
  const external=(typeof portalSeasons!=='undefined'&&Array.isArray(portalSeasons))?portalSeasons:[];
  const source=approvedPortalSeasons.length?approvedPortalSeasons:external;
  return source.find(s=>s?.is_active!==false&&iso>=String(s.start_date||'')&&iso<=String(s.end_date||''))||null;
}
async function loadSeasonsReadOnly(){
  if(seasonLoadStarted)return;seasonLoadStarted=true;
  try{
    if(typeof supabaseClient==='undefined'||!supabaseClient)return;
    const {data,error}=await supabaseClient.from('customer_portal_seasons').select('id,season_name,start_date,end_date,season_price,is_active').eq('is_active',true).order('start_date',{ascending:true});
    if(error)throw error;
    approvedPortalSeasons=Array.isArray(data)?data:[];
    if(document.querySelector('#calendarView.view.active')&&typeof renderCalendar==='function')renderCalendar();
  }catch(error){console.warn('تعذر تحميل أسعار المواسم للتقويم؛ سيستمر التقويم بدون تغيير البيانات.',error)}
}

function currentCalendarMonth(){
  if(typeof calDate!=='undefined'&&calDate instanceof Date)return new Date(calDate.getFullYear(),calDate.getMonth(),1);
  return new Date(new Date().getFullYear(),new Date().getMonth(),1);
}
function monthHeading(date){return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{year:'numeric',month:'long'}).format(date)}
function hijriHeading(first,last){
  const fmt=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{year:'numeric',month:'long'}),a=fmt.format(first),b=fmt.format(last);
  return a===b?a:`${a} – ${b}`;
}
function decorateHeader(){
  const title=document.getElementById('calTitle');if(!title)return;
  const first=currentCalendarMonth(),last=new Date(first.getFullYear(),first.getMonth()+1,0,12);
  title.innerHTML=`<span class="calendar-title-main">تقويم الحجوزات</span><span class="calendar-title-month">${safe(monthHeading(first))}</span><span class="calendar-title-hijri">${safe(hijriHeading(first,last))}</span>`;
  const toolbar=document.querySelector('#calendarView .calendar-toolbar');if(!toolbar)return;
  const buttons=[...toolbar.querySelectorAll('button')];
  if(buttons[0]){buttons[0].classList.add('calendar-nav-icon');buttons[0].textContent='→';buttons[0].setAttribute('aria-label','الشهر السابق');buttons[0].title='الشهر السابق'}
  if(buttons[1]){buttons[1].classList.add('calendar-nav-icon','calendar-today-button');buttons[1].textContent='◎';buttons[1].setAttribute('aria-label','العودة إلى هذا الشهر');buttons[1].title='هذا الشهر'}
  if(buttons[2]){buttons[2].classList.add('calendar-nav-icon');buttons[2].textContent='←';buttons[2].setAttribute('aria-label','الشهر التالي');buttons[2].title='الشهر التالي'}
  if(!toolbar.querySelector('.calendar-refresh')){
    const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary calendar-nav-icon calendar-refresh';refresh.textContent='↻';refresh.title='تحديث التقويم';refresh.setAttribute('aria-label','تحديث التقويم');refresh.addEventListener('click',()=>{if(typeof renderCalendar==='function')renderCalendar();void loadSeasonsReadOnly()});toolbar.appendChild(refresh);
  }
}
function assignDayDates(){
  const grid=document.getElementById('calendar');if(!grid)return [];
  const first=currentCalendarMonth();
  const cells=[...grid.querySelectorAll('.day:not(.calendar-weekday)')];
  cells.forEach((cell,index)=>{const date=new Date(first.getFullYear(),first.getMonth(),index+1,12);cell.dataset.date=isoForDate(date)});
  return cells;
}
function cleanOriginalEvents(day){day.querySelectorAll('.calendar-event,.calendar-approved-season,.calendar-approved-price-pending').forEach(node=>node.remove())}
function decorateDay(day){
  const iso=day.dataset.date;if(!iso)return;
  cleanOriginalEvents(day);
  const events=approvedEvents(iso),season=activeSeason(iso);
  if(events.length){
    const badge=document.createElement('span');badge.className='calendar-event';badge.textContent=events[0].name.replace(/ — .+$/,'');day.appendChild(badge);
    if(events.length>1){const more=document.createElement('span');more.className='calendar-approved-price-pending';more.textContent=`+${events.length-1} مناسبة/إجازة`;day.appendChild(more)}
  }
  if(season){
    const badge=document.createElement('span');badge.className='calendar-approved-season';badge.textContent=`${season.season_name} • ${Number(season.season_price||0).toLocaleString('ar-SA')} ريال`;day.appendChild(badge);
  }else if(events.length){
    const pending=document.createElement('span');pending.className='calendar-approved-price-pending';pending.textContent='سعر المناسبة يحدد من قبل الإدارة';day.appendChild(pending);
  }
  const dots=[...day.querySelectorAll('.dot')];
  dots.forEach(dot=>{
    const text=String(dot.textContent||'').trim();
    dot.classList.toggle('calendar-approved-client',text!=='متاح'&&text!=='اضغط للحجز');
  });
}
function collapseMonthEvents(year,month){
  const days=new Date(year,month+1,0).getDate(),open=new Map(),out=[];
  for(let d=1;d<=days;d++){
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const todays=approvedEvents(iso),keys=new Set();
    todays.forEach(event=>{
      const key=`${event.name}|${event.audience||''}`;keys.add(key);
      if(!open.has(key))open.set(key,{...event,start:iso,end:iso});else open.get(key).end=iso;
    });
    [...open.entries()].forEach(([key,item])=>{if(!keys.has(key)){out.push(item);open.delete(key)}});
  }
  out.push(...open.values());
  return out.sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name));
}
function formatRange(start,end){
  const fmt=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{day:'numeric',month:'short'}),a=fmt.format(noon(start)),b=fmt.format(noon(end));return start===end?a:`${a} – ${b}`;
}
function formatHijriShort(iso){return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'short'}).format(noon(iso))}
function renderMonthEvents(){
  const grid=document.getElementById('calendar');if(!grid)return;
  let root=document.getElementById('calendarMonthEvents');
  if(!root){root=document.createElement('section');root.id='calendarMonthEvents';root.className='calendar-month-events';grid.insertAdjacentElement('afterend',root)}
  const first=currentCalendarMonth(),items=collapseMonthEvents(first.getFullYear(),first.getMonth());
  const seasonItems=(approvedPortalSeasons.length?approvedPortalSeasons:((typeof portalSeasons!=='undefined'&&Array.isArray(portalSeasons))?portalSeasons:[])).filter(s=>s?.is_active!==false&&String(s.start_date||'')<=isoForDate(new Date(first.getFullYear(),first.getMonth()+1,0,12))&&String(s.end_date||'')>=isoForDate(first));
  const rows=items.map(item=>`<div class="calendar-month-event"><div><strong>${safe(item.name)}</strong><small>${safe(item.audience||'')}${activeSeason(item.start)?` • سعر خاص: ${safe(activeSeason(item.start).season_name)}`:''}</small></div><time>${safe(formatRange(item.start,item.end))} • ${safe(formatHijriShort(item.start))}</time></div>`).join('');
  const seasonRows=seasonItems.map(season=>`<div class="calendar-month-event"><div><strong>موسم / سعر خاص: ${safe(season.season_name)}</strong><small>${Number(season.season_price||0).toLocaleString('ar-SA')} ريال</small></div><time>${safe(formatRange(season.start_date,season.end_date))}</time></div>`).join('');
  root.innerHTML=`<div class="calendar-month-events-head"><h4>مناسبات هذا الشهر</h4><span>الإجازات والمواسم</span></div><div class="calendar-month-events-list">${rows}${seasonRows}${(!rows&&!seasonRows)?'<div class="calendar-month-events-empty">لا توجد مناسبات أو مواسم مسجلة لهذا الشهر.</div>':''}</div>`;
}
function simplifyLegendAndNotice(){
  const notice=document.querySelector('#calendarView .notice');if(notice)notice.textContent='اضغط على يوم متاح لإضافة حجز مباشرة، أو على يوم محجوز لفتح الحجز. المناسبات يظهر سعرها الخاص إذا حددته الإدارة.';
}
function decorate(){
  if(!document.getElementById('calendarView'))return;
  decorateHeader();
  const days=assignDayDates();days.forEach(decorateDay);
  renderMonthEvents();simplifyLegendAndNotice();
}
function install(){
  if(typeof renderCalendar==='function'&&!renderCalendar.__approvedCalendarWrapped){
    const original=renderCalendar;
    const wrapped=function(){const result=original.apply(this,arguments);decorate();return result};
    wrapped.__approvedCalendarWrapped=true;renderCalendar=wrapped;
  }
  decorate();void loadSeasonsReadOnly();
  const view=document.getElementById('calendarView');if(view)new MutationObserver(()=>{if(view.classList.contains('active'))requestAnimationFrame(decorate)}).observe(view,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
