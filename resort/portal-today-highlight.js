(()=>{
'use strict';
if(window.__adwaaPortalTodayHighlightInstalled)return;
window.__adwaaPortalTodayHighlightInstalled=true;

const weekdayFormatter=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long'});

function localIso(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function ensureStyle(){
  if(document.getElementById('portalTodayHighlightStyle'))return;
  const style=document.createElement('style');
  style.id='portalTodayHighlightStyle';
  style.textContent=`
    .calendar-day.portal-today{position:relative;border:3px solid #c99b42!important;box-shadow:0 0 0 3px rgba(201,155,66,.22)!important}
    .calendar-day.portal-today:before{content:'اليوم';position:absolute;top:3px;left:3px;padding:1px 5px;border-radius:999px;background:#c99b42;color:#17372f;font-size:8px;font-weight:900;line-height:1.5;z-index:2}
    .calendar-day.portal-today.unavailable{border-color:#c99b42!important;opacity:1}
    .header-whatsapp-hidden{display:none!important}
    .nav-availability{background:var(--gold);color:#18352d;white-space:nowrap}
    .calendar-day .calendar-weekday{display:none}
    @media(max-width:680px){
      .nav-availability{min-width:96px;justify-content:center;padding-inline:12px;font-size:13px}
      .calendar-shell{padding:9px!important;overflow:hidden}
      .calendar-toolbar{margin-bottom:10px!important}
      .calendar-toolbar h3{font-size:20px!important}
      .weekdays{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:3px!important;margin-bottom:4px!important;font-size:8px!important;line-height:1.2}
      .weekdays span{min-width:0;overflow:hidden;text-overflow:clip;white-space:nowrap}
      .calendar-grid{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:3px!important;direction:rtl}
      .calendar-empty{display:block!important;min-height:66px!important;border-radius:5px!important}
      .calendar-day{min-width:0!important;min-height:74px!important;padding:4px 2px!important;border-radius:5px!important;gap:0!important;text-align:center!important;justify-items:center!important;overflow:hidden}
      .calendar-day strong{font-size:13px!important;line-height:1.2}
      .calendar-day>small:not(.calendar-weekday){font-size:7px!important;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .calendar-day .calendar-weekday{display:none!important}
      .calendar-day span{margin-top:2px!important;padding:1px 3px!important;font-size:7px!important;max-width:100%;white-space:nowrap}
      .calendar-day em{font-size:7px!important;line-height:1.2;white-space:nowrap}
      .calendar-day b{font-size:6px!important;max-width:100%}
      .calendar-day.portal-today:before{top:1px;left:1px;padding:0 3px;font-size:6px}
      .floating-whatsapp.floating-whatsapp-compact{right:auto;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));width:44px;height:44px;min-width:44px;min-height:44px;justify-content:center;padding:0;font-size:0;border-radius:50%;box-shadow:0 10px 24px rgba(16,63,53,.24)}
      .floating-whatsapp.floating-whatsapp-compact:after{content:'واتساب';font-size:9px;font-weight:900}
    }
  `;
  document.head.appendChild(style);
}
function installAvailabilityButton(){
  const whatsapp=document.getElementById('headerWhatsappButton');
  if(!whatsapp)return;
  whatsapp.classList.add('header-whatsapp-hidden');
  if(document.getElementById('headerAvailabilityButton'))return;
  const button=document.createElement('a');
  button.id='headerAvailabilityButton';
  button.className='nav-whatsapp nav-availability';
  button.href='#clientCalendar';
  button.textContent='اختر التوفر';
  button.setAttribute('aria-label','الانتقال إلى تقويم التوفر');
  whatsapp.insertAdjacentElement('afterend',button);
}
function compactFloatingWhatsapp(){
  const button=document.getElementById('floatingWhatsappButton');
  if(!button)return;
  button.classList.add('floating-whatsapp-compact');
  button.setAttribute('aria-label','تواصل عبر واتساب');
}
function decorateCalendarDays(grid){
  grid.querySelectorAll('.calendar-day[data-date]').forEach(day=>{
    const iso=String(day.dataset.date||'');
    const date=new Date(`${iso}T12:00:00`);
    if(Number.isNaN(date.getTime()))return;
    day.dataset.weekday=weekdayFormatter.format(date);
  });
}
function refreshCalendarUi(){
  ensureStyle();
  const grid=document.getElementById('calendarGrid');if(!grid)return;
  decorateCalendarDays(grid);
  grid.querySelectorAll('.calendar-day.portal-today').forEach(day=>day.classList.remove('portal-today'));
  const today=grid.querySelector(`.calendar-day[data-date="${localIso()}"]`);
  if(today){
    today.classList.add('portal-today');
    const current=today.getAttribute('aria-label')||'';
    if(!current.includes('اليوم'))today.setAttribute('aria-label',`اليوم، ${current}`);
  }
}
function initialize(){
  ensureStyle();
  installAvailabilityButton();
  compactFloatingWhatsapp();
  const grid=document.getElementById('calendarGrid');if(!grid)return;
  refreshCalendarUi();
  new MutationObserver(()=>requestAnimationFrame(refreshCalendarUi)).observe(grid,{childList:true});
  document.getElementById('prevMonthButton')?.addEventListener('click',()=>requestAnimationFrame(refreshCalendarUi));
  document.getElementById('nextMonthButton')?.addEventListener('click',()=>requestAnimationFrame(refreshCalendarUi));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
