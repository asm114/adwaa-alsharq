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
    .calendar-day.portal-today{position:relative;border:2px solid #c99b42!important;box-shadow:0 0 0 3px rgba(201,155,66,.18)!important}
    .calendar-day.portal-today:before{content:'اليوم';position:absolute;top:5px;left:5px;padding:2px 6px;border-radius:999px;background:#c99b42;color:#17372f;font-size:9px;font-weight:900;line-height:1.5;z-index:1}
    .calendar-day.portal-today.unavailable{border-color:#c99b42!important;opacity:1}
    @media(max-width:620px){.calendar-day.portal-today:before{top:3px;left:3px;padding:1px 4px;font-size:8px}}
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
    if(current&&!current.includes('اليوم'))today.setAttribute('aria-label',`اليوم، ${current}`);
  }
}
function initialize(){
  const grid=document.getElementById('calendarGrid');
  if(!grid){setTimeout(initialize,200);return}
  markToday();
  new MutationObserver(()=>requestAnimationFrame(markToday)).observe(grid,{childList:true});
  document.getElementById('prevMonthButton')?.addEventListener('click',()=>setTimeout(markToday,0));
  document.getElementById('nextMonthButton')?.addEventListener('click',()=>setTimeout(markToday,0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
