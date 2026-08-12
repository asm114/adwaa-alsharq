(()=>{
'use strict';
if(window.__adwaaPortalTodayHighlightInstalled)return;
window.__adwaaPortalTodayHighlightInstalled=true;

const AVAILABILITY_SUPABASE_URL='https://ztqqdjryvecscidxxbfe.supabase.co';
const AVAILABILITY_SUPABASE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const AVAILABILITY_TABLE='customer_portal_unavailable_periods';
let availabilityClient=null;
let refreshingAvailability=false;

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
async function refreshAvailability(){
  if(refreshingAvailability||!window.supabase?.createClient)return;
  refreshingAvailability=true;
  try{
    availabilityClient=availabilityClient||window.supabase.createClient(
      AVAILABILITY_SUPABASE_URL,
      AVAILABILITY_SUPABASE_KEY,
      {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
    );
    const {data,error}=await availabilityClient
      .from(AVAILABILITY_TABLE)
      .select('id,start_date,end_date')
      .order('start_date',{ascending:true});
    if(error)throw error;
    if(typeof unavailablePeriods!=='undefined')unavailablePeriods=Array.isArray(data)?data:[];
    if(typeof renderCalendar==='function')renderCalendar();
    markToday();
  }catch(error){
    console.warn('تعذر تحميل توفر الحجوزات من مشروع بوابة العملاء.',error);
    markToday();
  }finally{
    refreshingAvailability=false;
  }
}
function initialize(){
  const grid=document.getElementById('calendarGrid');
  if(!grid){setTimeout(initialize,200);return}
  markToday();
  refreshAvailability();
  new MutationObserver(()=>requestAnimationFrame(markToday)).observe(grid,{childList:true});
  document.getElementById('prevMonthButton')?.addEventListener('click',()=>setTimeout(markToday,0));
  document.getElementById('nextMonthButton')?.addEventListener('click',()=>setTimeout(markToday,0));
  window.addEventListener('focus',()=>refreshAvailability());
  window.addEventListener('pageshow',()=>refreshAvailability());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
