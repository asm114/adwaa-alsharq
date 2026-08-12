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
    .calendar-day.portal-today{position:relative;border:3px solid #c99b42!important;box-shadow:0 0 0 3px rgba(201,155,66,.22)!important;background-image:linear-gradient(rgba(201,155,66,.07),rgba(201,155,66,.07))!important}
    .calendar-day.portal-today:before{content:'📍 اليوم';position:absolute;top:4px;left:4px;padding:3px 7px;border-radius:999px;background:#c99b42;color:#17372f;font-size:10px;font-weight:900;line-height:1.35;z-index:3;box-shadow:0 2px 5px rgba(0,0,0,.12)}
    .calendar-day.portal-today strong{padding-top:18px}
    .calendar-day.portal-today.unavailable{border-color:#c99b42!important;opacity:1}
    @media(max-width:620px){.calendar-day.portal-today:before{top:2px;left:2px;padding:2px 5px;font-size:8px}.calendar-day.portal-today strong{padding-top:16px}}
  `;
  document.head.appendChild(style);
}
function markToday(){
  ensureStyle();
  const grid=document.getElementById('calendarGrid');if(!grid)return;
  grid.querySelectorAll('.calendar-day.portal-today').forEach(day=>day.classList.remove('portal-today'));
  const iso=localIso();
  const today=grid.querySelector(`.calendar-day[data-date="${iso}"]`);
  if(today){
    today.classList.add('portal-today');
    today.dataset.today='true';
    const current=today.getAttribute('aria-label')||'';
    if(!current.includes('اليوم'))today.setAttribute('aria-label',`اليوم، ${current||iso}`);
  }
}
function initialize(){
  const grid=document.getElementById('calendarGrid');
  if(!grid){setTimeout(initialize,200);return}
  markToday();
  new MutationObserver(()=>requestAnimationFrame(markToday)).observe(grid,{childList:true,subtree:false});
  document.getElementById('prevMonthButton')?.addEventListener('click',()=>setTimeout(markToday,0));
  document.getElementById('nextMonthButton')?.addEventListener('click',()=>setTimeout(markToday,0));
  window.addEventListener('focus',markToday);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
