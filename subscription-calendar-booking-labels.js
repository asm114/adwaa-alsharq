(()=>{
'use strict';
if(window.__adwaaSubscriptionCalendarBookingLabelsInstalled)return;
window.__adwaaSubscriptionCalendarBookingLabelsInstalled=true;

const DAY_MS=86400000;
const pad=n=>String(n).padStart(2,'0');
const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseKey=value=>{const [y,m,d]=String(value||'').split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):null};
const today=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())};
const daysUntil=key=>{const d=parseKey(key);return d?Math.round((d.getTime()-today().getTime())/DAY_MS):null};

function bookingForDate(key){
  const bookings=Array.isArray(window.db?.bookings)?window.db.bookings:[];
  for(const b of bookings){
    if(b?.status==='ملغي')continue;
    const start=parseKey(b?.date);if(!start)continue;
    const days=Math.max(1,Number(b?.stayDays||1));
    for(let i=0;i<days;i++){
      const d=new Date(start);d.setDate(d.getDate()+i);
      if(keyOf(d)===key)return b;
    }
  }
  return null;
}

function temporaryForDate(key){
  const drafts=Array.isArray(window.db?.subscriptionDrafts)?window.db.subscriptionDrafts:[];
  const now=Date.now();
  return drafts.find(d=>d?.status==='holding'&&new Date(d.expiresAt||0).getTime()>now&&Array.isArray(d.dates)&&d.dates.includes(key))||null;
}

function labelFor(key){
  const temporary=temporaryForDate(key);
  if(temporary)return{name:String(temporary.name||'حجز مؤقت'),temporary:true};
  const booking=bookingForDate(key);
  if(!booking)return null;
  const family=booking.recordType==='family'||booking.type==='تواجد العائلة';
  return{name:family?'تواجد العائلة':String(booking.name||'حجز'),temporary:false};
}

function installStyle(){
  if(document.getElementById('subscriptionCalendarBookingLabelsStyle'))return;
  const style=document.createElement('style');style.id='subscriptionCalendarBookingLabelsStyle';
  style.textContent=`
  #subscriptionCalendar .subscription-day{position:relative;overflow:hidden}
  #subscriptionCalendar .subscription-customer-mini{display:block;max-width:100%;margin-top:3px;font-size:8.5px;line-height:1.15;font-weight:800;color:#455a54;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #subscriptionCalendar .subscription-countdown-mini{display:inline-flex;align-items:center;justify-content:center;min-width:22px;margin-top:3px;padding:1px 4px;border-radius:999px;background:#fff8e8;border:1px solid #ead7a7;color:#765b18;font-size:8px;font-weight:900;line-height:1.2;direction:ltr}
  #subscriptionCalendar .subscription-countdown-mini.temporary{background:#fff0cc;border-color:#e4b44f;color:#7b5700}
  @media(max-width:620px){#subscriptionCalendar .subscription-customer-mini{font-size:7.5px}#subscriptionCalendar .subscription-countdown-mini{font-size:7px;min-width:19px;padding:1px 3px}}
  `;
  document.head.appendChild(style);
}

function decorate(){
  const calendar=document.getElementById('subscriptionCalendar');if(!calendar)return;
  for(const cell of calendar.querySelectorAll('.subscription-day.busy')){
    if(cell.dataset.bookingLabelDone==='1')continue;
    const match=String(cell.getAttribute('onclick')||'').match(/'(\d{4}-\d{2}-\d{2})'/);if(!match)continue;
    const key=match[1],info=labelFor(key);if(!info)continue;
    cell.dataset.bookingLabelDone='1';
    const name=document.createElement('span');name.className='subscription-customer-mini';name.textContent=info.name;cell.appendChild(name);
    const remaining=daysUntil(key);
    if(remaining!==null&&remaining>=0){const badge=document.createElement('span');badge.className=`subscription-countdown-mini${info.temporary?' temporary':''}`;badge.textContent=`⏳${remaining}`;badge.title=remaining===0?'الحجز اليوم':`متبقي ${remaining} يوم`;cell.appendChild(badge)}
    cell.title=`${info.name}${remaining!==null&&remaining>=0?` — ${remaining===0?'اليوم':`متبقي ${remaining} يوم`}`:''}${info.temporary?' — حجز مؤقت':''}`;
  }
}

function watch(){
  installStyle();decorate();
  const root=document.getElementById('subscriptionModal')||document.body;
  const observer=new MutationObserver(()=>{try{decorate()}catch(error){console.warn('تعذر تحديث تسميات تقويم الاشتراك',error)}});
  observer.observe(root,{childList:true,subtree:true});
  setInterval(()=>{try{decorate()}catch(error){}},3000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
