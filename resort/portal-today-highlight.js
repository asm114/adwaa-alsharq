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
    .calendar-day.portal-today:before{content:'📍 اليوم';position:absolute;top:4px;left:4px;padding:2px 7px;border-radius:999px;background:#c99b42;color:#17372f;font-size:9px;font-weight:900;line-height:1.5;z-index:2}
    .calendar-day.portal-today.unavailable{border-color:#c99b42!important;opacity:1}
    .header-whatsapp-hidden{display:none!important}
    .nav-availability{background:var(--gold);color:#18352d;white-space:nowrap}
    .calendar-day .calendar-weekday{display:none}
    @media(max-width:680px){
      .calendar-day.portal-today:before{top:2px;left:2px;padding:1px 4px;font-size:8px}
      .nav-availability{min-width:96px;justify-content:center;padding-inline:12px;font-size:13px}
      .calendar-day{min-height:118px}
      .calendar-day .calendar-weekday{display:block;color:var(--green-2);font-size:12px;font-weight:900;line-height:1.35;white-space:nowrap;overflow:visible;text-overflow:clip;margin-top:1px}
      .floating-whatsapp.floating-whatsapp-compact{right:auto;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));width:auto;max-width:none;min-width:84px;min-height:44px;justify-content:center;padding:8px 14px;font-size:13px;box-shadow:0 10px 24px rgba(16,63,53,.24)}
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
    if(day.querySelector('.calendar-weekday'))return;
    const iso=String(day.dataset.date||'');
    const date=new Date(`${iso}T12:00:00`);
    if(Number.isNaN(date.getTime()))return;
    const label=document.createElement('small');
    label.className='calendar-weekday';
    label.textContent=weekdayFormatter.format(date);
    const hijri=day.querySelector('small');
    if(hijri)day.insertBefore(label,hijri);else day.appendChild(label);
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
