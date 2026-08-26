(()=>{
'use strict';

function isHighDemandPortalDay(date){
  if(!date||typeof date.getDay!=='function')return false;
  const day=date.getDay();
  return day===4||day===5;
}

try{
  isWeekend=isHighDemandPortalDay;
}catch(_){
  window.isWeekend=isHighDemandPortalDay;
}

window.isPortalHighDemandDay=isHighDemandPortalDay;

const HIJRI_NUMERIC_FORMATTER=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{
  year:'numeric',month:'numeric',day:'numeric'
});

function hijriPartsForDate(date){
  const values={};
  HIJRI_NUMERIC_FORMATTER.formatToParts(date).forEach(part=>{
    if(part.type==='year'||part.type==='month'||part.type==='day')values[part.type]=Number(part.value);
  });
  return values;
}

function dateAtNoon(iso){
  return new Date(`${iso}T12:00:00`);
}

function isFitrHoliday(date,hijri){
  if(hijri.month===9&&hijri.day===30)return true;
  if(hijri.month!==10||hijri.day<1||hijri.day>4)return false;

  const shawwalFirst=new Date(date);
  shawwalFirst.setDate(shawwalFirst.getDate()-(hijri.day-1));
  const previousDay=new Date(shawwalFirst);
  previousDay.setDate(previousDay.getDate()-1);
  const previousHijri=hijriPartsForDate(previousDay);
  const ramadanHadThirtyDays=previousHijri.month===9&&previousHijri.day===30;

  return hijri.day<=(ramadanHadThirtyDays?3:4);
}

function getSaudiOfficialHoliday(iso){
  const date=dateAtNoon(iso);
  if(Number.isNaN(date.getTime()))return null;

  const month=date.getMonth()+1;
  const day=date.getDate();
  if(month===2&&day===22)return {name:'يوم التأسيس',kind:'national'};
  if(month===9&&day===23)return {name:'اليوم الوطني السعودي',kind:'national'};

  const hijri=hijriPartsForDate(date);
  if(isFitrHoliday(date,hijri)){
    return {name:hijri.month===10&&hijri.day===1?'عيد الفطر':'إجازة عيد الفطر',kind:'eid'};
  }
  if(hijri.month===12&&hijri.day>=9&&hijri.day<=12){
    if(hijri.day===9)return {name:'وقفة عرفة — إجازة عيد الأضحى',kind:'eid'};
    if(hijri.day===10)return {name:'عيد الأضحى',kind:'eid'};
    return {name:'إجازة عيد الأضحى',kind:'eid'};
  }
  return null;
}

window.getSaudiOfficialHoliday=getSaudiOfficialHoliday;

function installEnhancementStyles(){
  if(document.getElementById('portalBookingEnhancementStyles'))return;
  const style=document.createElement('style');
  style.id='portalBookingEnhancementStyles';
  style.textContent=`
    body.booking-confirmation-open{overflow:hidden}
    .calendar-day.saudi-holiday{border-color:#c99b42;box-shadow:inset 0 0 0 1px rgba(201,155,66,.18)}
    .calendar-day .saudi-holiday-badge{margin-top:4px;padding:3px 6px;border-radius:5px;background:#f7ecd2;color:#765816;font-size:9px;font-weight:900;line-height:1.35;text-align:center}
    .calendar-legend .holiday-dot{background:#c99b42}
    .selected-holiday-line{margin-top:3px;padding:6px 9px;border-radius:6px;background:#f7ecd2;color:#765816;font-weight:800}
    .booking-confirmation-modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(4,25,20,.68);backdrop-filter:blur(5px)}
    .booking-confirmation-modal[hidden]{display:none}
    .booking-confirmation-card{position:relative;width:min(460px,100%);padding:26px;border-radius:12px;background:#fff;color:#16312a;box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .booking-confirmation-close{position:absolute;top:12px;left:12px;width:42px;height:42px;border:1px solid #dce3de;border-radius:50%;background:#f7f4ec;color:#103f35;font-size:25px;line-height:1;cursor:pointer}
    .booking-confirmation-kicker{margin:0 0 4px;color:#c99b42;font-size:13px;font-weight:900}
    .booking-confirmation-card h3{margin:0;padding-left:46px;color:#103f35;font-size:25px;line-height:1.35}
    .booking-confirmation-summary{display:grid;gap:8px;margin-top:20px;padding:16px;border:1px solid #dce3de;border-radius:8px;background:#f7f4ec}
    .booking-confirmation-summary span{display:flex;justify-content:space-between;gap:16px;color:#687871;font-size:14px}
    .booking-confirmation-summary strong{color:#16312a;text-align:left}
    .booking-confirmation-holiday{margin:12px 0 0;padding:10px 12px;border-radius:7px;background:#f7ecd2;color:#765816;font-size:13px;font-weight:900}
    .booking-confirmation-note{margin:14px 0 0;color:#687871;font-size:13px;line-height:1.7}
    .booking-confirmation-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:20px}
    .booking-confirmation-whatsapp,.booking-confirmation-cancel{min-height:48px;display:flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:7px;font-weight:900;text-decoration:none;cursor:pointer}
    .booking-confirmation-whatsapp{border:1px solid #103f35;background:#103f35;color:#fff}
    .booking-confirmation-whatsapp.is-disabled{pointer-events:none;opacity:.48}
    .booking-confirmation-cancel{border:1px solid #dce3de;background:#fff;color:#103f35}
    @media(max-width:560px){
      .booking-confirmation-card{padding:22px 18px}
      .booking-confirmation-card h3{font-size:22px}
      .booking-confirmation-actions{grid-template-columns:1fr}
      .booking-confirmation-summary span{display:grid;gap:2px}
      .booking-confirmation-summary strong{text-align:right}
    }
  `;
  document.head.appendChild(style);
}

function ensureHolidayLegend(){
  const legend=document.querySelector('.calendar-legend');
  if(!legend||legend.querySelector('[data-saudi-holiday-legend]'))return;
  const item=document.createElement('span');
  item.dataset.saudiHolidayLegend='true';
  item.innerHTML='<i class="holiday-dot"></i> إجازة/مناسبة رسمية';
  item.title='ظهور المناسبة لا يعني أن اليوم محجوز';
  legend.appendChild(item);
}

function annotateSaudiHolidays(){
  document.querySelectorAll('.calendar-day[data-date]').forEach(button=>{
    button.classList.remove('saudi-holiday');
    button.querySelector('.saudi-holiday-badge')?.remove();
    const holiday=getSaudiOfficialHoliday(button.dataset.date);
    if(!holiday)return;
    button.classList.add('saudi-holiday');
    button.dataset.saudiHoliday=holiday.name;
    const badge=document.createElement('div');
    badge.className='saudi-holiday-badge';
    badge.textContent=holiday.name;
    button.appendChild(badge);
    const baseLabel=button.getAttribute('aria-label')||'';
    if(baseLabel&&!baseLabel.includes(holiday.name))button.setAttribute('aria-label',`${baseLabel}، ${holiday.name}`);
  });
  ensureHolidayLegend();
}

function addSelectedHolidayLine(iso){
  const holiday=getSaudiOfficialHoliday(iso);
  if(!holiday||typeof selectedDayCard==='undefined'||!selectedDayCard)return;
  selectedDayCard.querySelector('.selected-holiday-line')?.remove();
  const line=document.createElement('span');
  line.className='selected-holiday-line';
  line.textContent=`المناسبة: ${holiday.name}`;
  const requestButton=selectedDayCard.querySelector('#bookingRequestButton');
  if(requestButton)selectedDayCard.insertBefore(line,requestButton);
  else selectedDayCard.appendChild(line);
}

function ensureBookingModal(){
  let modal=document.getElementById('bookingConfirmationModal');
  if(modal)return modal;

  modal=document.createElement('div');
  modal.id='bookingConfirmationModal';
  modal.className='booking-confirmation-modal';
  modal.hidden=true;
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','bookingConfirmationTitle');
  modal.innerHTML=`
    <div class="booking-confirmation-card">
      <button class="booking-confirmation-close" type="button" aria-label="إغلاق">×</button>
      <p class="booking-confirmation-kicker">طلب حجز</p>
      <h3 id="bookingConfirmationTitle">هل تريد طلب حجز هذا اليوم؟</h3>
      <div class="booking-confirmation-summary">
        <span><b>الميلادي</b><strong id="bookingConfirmationGregorian">—</strong></span>
        <span><b>الهجري</b><strong id="bookingConfirmationHijri">—</strong></span>
        <span id="bookingConfirmationPriceRow"><b>السعر</b><strong id="bookingConfirmationPrice">—</strong></span>
      </div>
      <div id="bookingConfirmationHoliday" class="booking-confirmation-holiday" hidden></div>
      <p class="booking-confirmation-note">سيتم نقلك إلى واتساب برسالة جاهزة بالتاريخ الهجري والميلادي. الطلب لا يعتبر حجزًا مؤكدًا حتى موافقة الإدارة.</p>
      <div class="booking-confirmation-actions">
        <a id="bookingConfirmationWhatsapp" class="booking-confirmation-whatsapp" href="#" target="_blank" rel="noopener">متابعة عبر واتساب</a>
        <button class="booking-confirmation-cancel" type="button">إلغاء</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal=()=>{
    modal.hidden=true;
    document.body.classList.remove('booking-confirmation-open');
    const returnTarget=modal._returnFocus;
    if(returnTarget&&typeof returnTarget.focus==='function')returnTarget.focus();
  };

  modal.querySelector('.booking-confirmation-close').addEventListener('click',closeModal);
  modal.querySelector('.booking-confirmation-cancel').addEventListener('click',closeModal);
  modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
  modal.querySelector('#bookingConfirmationWhatsapp').addEventListener('click',()=>{
    if(!modal.querySelector('#bookingConfirmationWhatsapp').classList.contains('is-disabled'))setTimeout(closeModal,0);
  });
  modal._close=closeModal;
  return modal;
}

function openBookingConfirmation(iso,returnFocus){
  const modal=ensureBookingModal();
  const date=dateAtNoon(iso);
  let pricing=null;
  try{pricing=getDayPricing(iso,date);}catch(_){pricing=null;}
  const holiday=getSaudiOfficialHoliday(iso);
  let canRequest=false;
  let requestUrl='#';
  try{
    canRequest=Boolean(portalContact?.whatsapp_number);
    requestUrl=canRequest?createBookingRequestUrl(iso,pricing):'#';
  }catch(_){
    canRequest=false;
  }

  modal.querySelector('#bookingConfirmationGregorian').textContent=formatGregorian(iso);
  modal.querySelector('#bookingConfirmationHijri').textContent=formatHijri(iso);
  const priceRow=modal.querySelector('#bookingConfirmationPriceRow');
  if(pricing&&hasPublicPrice(pricing.price)){
    modal.querySelector('#bookingConfirmationPrice').textContent=formatMoney(pricing.price);
    priceRow.hidden=false;
  }else{
    priceRow.hidden=true;
  }

  const holidayBox=modal.querySelector('#bookingConfirmationHoliday');
  if(holiday){
    holidayBox.textContent=`${holiday.name} — التاريخ ما زال خاضعًا لحالة التوفر في التقويم.`;
    holidayBox.hidden=false;
  }else{
    holidayBox.hidden=true;
  }

  const whatsapp=modal.querySelector('#bookingConfirmationWhatsapp');
  whatsapp.href=requestUrl;
  whatsapp.classList.toggle('is-disabled',!canRequest);
  whatsapp.setAttribute('aria-disabled',canRequest?'false':'true');
  whatsapp.textContent=canRequest?'متابعة عبر واتساب':'واتساب غير متاح حاليًا';

  modal._returnFocus=returnFocus||document.activeElement;
  modal.hidden=false;
  document.body.classList.add('booking-confirmation-open');
  (canRequest?whatsapp:modal.querySelector('.booking-confirmation-cancel')).focus();
}

installEnhancementStyles();
ensureBookingModal();
ensureHolidayLegend();

try{
  const originalRenderCalendar=renderCalendar;
  renderCalendar=function(){
    const result=originalRenderCalendar.apply(this,arguments);
    annotateSaudiHolidays();
    return result;
  };
}catch(error){
  console.warn('تعذر تفعيل وسم الإجازات الرسمية في التقويم.',error);
}

try{
  const originalRenderSelectedDay=renderSelectedDay;
  renderSelectedDay=function(iso,unavailable){
    const result=originalRenderSelectedDay.apply(this,arguments);
    if(!unavailable)addSelectedHolidayLine(iso);
    return result;
  };
}catch(error){
  console.warn('تعذر إظهار المناسبة الرسمية في تفاصيل اليوم.',error);
}

try{
  const originalCreateBookingRequestMessage=createBookingRequestMessage;
  createBookingRequestMessage=function(iso,pricing){
    const message=originalCreateBookingRequestMessage.apply(this,arguments);
    const holiday=getSaudiOfficialHoliday(iso);
    if(!holiday)return message;
    const hijriLine=`- التاريخ الهجري: ${formatHijri(iso)}`;
    if(!message.includes(hijriLine))return message;
    return message.replace(hijriLine,`${hijriLine}\n- المناسبة: ${holiday.name}`);
  };
}catch(error){
  console.warn('تعذر إضافة المناسبة الرسمية إلى رسالة واتساب.',error);
}

document.addEventListener('click',event=>{
  const dayButton=event.target.closest?.('.calendar-day.available[data-date]');
  if(!dayButton)return;
  openBookingConfirmation(dayButton.dataset.date,dayButton);
});

document.addEventListener('keydown',event=>{
  const modal=document.getElementById('bookingConfirmationModal');
  if(event.key==='Escape'&&modal&&!modal.hidden&&typeof modal._close==='function')modal._close();
});

annotateSaudiHolidays();
})();
