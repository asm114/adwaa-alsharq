(()=>{
'use strict';
if(window.__adwaaPortalTodayHighlightInstalled)return;
window.__adwaaPortalTodayHighlightInstalled=true;

const weekdayFormatter=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long'});
const SPECIAL_OCCASION_PRICE_LABEL='سعر المناسبة';
const SPECIAL_OCCASION_PRICE_TEXT='يحدد من قبل الإدارة';

function localIso(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function holidayEvents(iso){
  try{
    return typeof window.getSaudiCalendarEvents==='function'?(window.getSaudiCalendarEvents(iso)||[]):[];
  }catch(_){
    return [];
  }
}
function hasConfiguredSeasonPrice(pricing){
  try{
    return Boolean(pricing?.seasonName)&&typeof hasPublicPrice==='function'&&hasPublicPrice(pricing?.price);
  }catch(_){
    return Boolean(pricing?.seasonName)&&Number(pricing?.price)>0;
  }
}
function installHolidayPricingPolicy(){
  if(window.__adwaaHolidayPricingInstalled||typeof getDayPricing!=='function')return;
  window.__adwaaHolidayPricingInstalled=true;

  const originalGetDayPricing=getDayPricing;
  getDayPricing=function(iso,date){
    const pricing=originalGetDayPricing.apply(this,arguments);
    if(!holidayEvents(iso).length)return pricing;
    if(hasConfiguredSeasonPrice(pricing)){
      return {...pricing,specialOccasion:true,specialPricePending:false};
    }
    return {
      ...(pricing||{}),
      price:null,
      seasonName:'',
      specialOccasion:true,
      specialPricePending:true,
      priceLabel:SPECIAL_OCCASION_PRICE_LABEL,
      priceText:SPECIAL_OCCASION_PRICE_TEXT
    };
  };

  if(typeof createBookingRequestMessage==='function'){
    const originalCreateBookingRequestMessage=createBookingRequestMessage;
    createBookingRequestMessage=function(iso,pricing){
      let message=originalCreateBookingRequestMessage.apply(this,arguments);
      if(!pricing?.specialPricePending||!holidayEvents(iso).length)return message;
      const line=`- ${SPECIAL_OCCASION_PRICE_LABEL}: ${SPECIAL_OCCASION_PRICE_TEXT}`;
      if(message.includes(line))return message;
      const hijriLine=`- التاريخ الهجري: ${formatHijri(iso)}`;
      if(message.includes(hijriLine))message=message.replace(hijriLine,`${hijriLine}\n${line}`);
      else message=`${message}\n${line}`;
      return message;
    };
  }
}
function pricingForDay(day){
  if(!day?.dataset?.date)return null;
  const iso=String(day.dataset.date);
  const date=new Date(`${iso}T12:00:00`);
  if(Number.isNaN(date.getTime()))return null;
  try{return getDayPricing(iso,date);}catch(_){return null;}
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
    .calendar-day em.special-occasion-price-pending{display:block;white-space:normal!important;color:#765816!important;font-style:normal!important;font-weight:900!important;line-height:1.25!important}
    .special-occasion-price-note{display:grid;gap:2px;margin-top:5px;padding:8px 10px;border-radius:6px;background:#f7ecd2;color:#765816;font-weight:900}
    .special-occasion-price-note small{font-weight:700}
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
      .calendar-day em.special-occasion-price-pending{font-size:6.5px!important;white-space:normal!important}
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

    const pricing=pricingForDay(day);
    const existing=day.querySelector('em');
    if(pricing?.specialPricePending){
      const priceNode=existing||document.createElement('em');
      priceNode.classList.add('special-occasion-price-pending');
      priceNode.textContent=`${SPECIAL_OCCASION_PRICE_LABEL} ${SPECIAL_OCCASION_PRICE_TEXT}`;
      if(!existing)day.appendChild(priceNode);
    }else if(existing){
      existing.classList.remove('special-occasion-price-pending');
    }
  });
}
function decorateSelectedDayPricing(){
  const selected=document.querySelector('.calendar-day.selected[data-date]');
  const card=document.getElementById('selectedDayCard');
  if(!selected||!card)return;
  const pricing=pricingForDay(selected);
  let note=card.querySelector('.special-occasion-price-note');
  if(!pricing?.specialPricePending){
    note?.remove();
    return;
  }
  if(!note){
    note=document.createElement('span');
    note.className='special-occasion-price-note';
    const requestButton=card.querySelector('#bookingRequestButton');
    if(requestButton)card.insertBefore(note,requestButton);else card.appendChild(note);
  }
  note.innerHTML=`<b>${SPECIAL_OCCASION_PRICE_LABEL}</b><small>${SPECIAL_OCCASION_PRICE_TEXT}</small>`;
}
function decorateBookingModalPricing(day){
  const pricing=pricingForDay(day);
  if(!pricing?.specialPricePending)return;
  const row=document.getElementById('bookingConfirmationPriceRow');
  if(!row)return;
  const label=row.querySelector('b');
  const value=row.querySelector('strong');
  if(label)label.textContent=SPECIAL_OCCASION_PRICE_LABEL;
  if(value)value.textContent=SPECIAL_OCCASION_PRICE_TEXT;
  row.hidden=false;
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
  decorateSelectedDayPricing();
}
function initialize(){
  installHolidayPricingPolicy();
  ensureStyle();
  installAvailabilityButton();
  compactFloatingWhatsapp();
  const grid=document.getElementById('calendarGrid');if(!grid)return;
  refreshCalendarUi();
  new MutationObserver(()=>requestAnimationFrame(refreshCalendarUi)).observe(grid,{childList:true});
  const selectedCard=document.getElementById('selectedDayCard');
  if(selectedCard)new MutationObserver(()=>requestAnimationFrame(decorateSelectedDayPricing)).observe(selectedCard,{childList:true});
  document.getElementById('prevMonthButton')?.addEventListener('click',()=>requestAnimationFrame(refreshCalendarUi));
  document.getElementById('nextMonthButton')?.addEventListener('click',()=>requestAnimationFrame(refreshCalendarUi));
  document.addEventListener('click',event=>{
    const day=event.target.closest?.('.calendar-day.available[data-date]');
    if(!day)return;
    requestAnimationFrame(()=>{
      decorateSelectedDayPricing();
      decorateBookingModalPricing(day);
    });
  });
}
installHolidayPricingPolicy();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
