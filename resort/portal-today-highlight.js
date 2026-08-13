(()=>{
'use strict';
if(window.__adwaaPortalTodayHighlightInstalled)return;
window.__adwaaPortalTodayHighlightInstalled=true;

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
    @media(max-width:620px){.calendar-day.portal-today:before{top:2px;left:2px;padding:1px 4px;font-size:8px}}
  `;
  document.head.appendChild(style);
}
function markToday(){
  ensureStyle();
  const grid=document.getElementById('calendarGrid');if(!grid)return;
  grid.querySelectorAll('.calendar-day.portal-today').forEach(day=>day.classList.remove('portal-today'));
  const today=grid.querySelector(`.calendar-day[data-date="${localIso()}"]`);
  if(today){
    today.classList.add('portal-today');
    const current=today.getAttribute('aria-label')||'';
    if(!current.includes('اليوم'))today.setAttribute('aria-label',`اليوم، ${current}`);
  }
}
function initialize(){
  const grid=document.getElementById('calendarGrid');if(!grid)return;
  markToday();
  new MutationObserver(()=>requestAnimationFrame(markToday)).observe(grid,{childList:true});
  document.getElementById('prevMonthButton')?.addEventListener('click',()=>requestAnimationFrame(markToday));
  document.getElementById('nextMonthButton')?.addEventListener('click',()=>requestAnimationFrame(markToday));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
