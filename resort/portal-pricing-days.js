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

const SCHOOL_HOLIDAYS_1448_1449=[
  {start:'2026-09-23',end:'2026-09-26',name:'إجازة اليوم الوطني — مدارس',kind:'school',audience:'طلاب المدارس'},
  {start:'2026-11-20',end:'2026-11-28',name:'إجازة الخريف — مدارس',kind:'school',audience:'طلاب المدارس'},
  {start:'2027-01-08',end:'2027-01-16',name:'إجازة منتصف العام — مدارس',kind:'school',audience:'طلاب المدارس'},
  {start:'2027-02-19',end:'2027-02-22',name:'إجازة يوم التأسيس — مدارس',kind:'school',audience:'طلاب المدارس'},
  {start:'2027-02-26',end:'2027-03-13',name:'إجازة عيد الفطر — مدارس',kind:'school',audience:'طلاب المدارس'},
  {start:'2027-05-07',end:'2027-05-22',name:'إجازة عيد الأضحى — مدارس',kind:'school',audience:'طلاب المدارس'},
  {start:'2027-06-24',end:'2027-08-28',name:'إجازة نهاية العام — مدارس',kind:'school',audience:'طلاب المدارس'}
];

const UNIVERSITY_COMMON_HOLIDAYS_1448_1449=[
  {start:'2026-09-23',end:'2026-09-24',name:'إجازة اليوم الوطني — جامعات',kind:'university',audience:'طلاب الجامعات',note:'قد تختلف المدة حسب الجامعة'},
  {start:'2026-11-19',end:'2026-11-28',name:'إجازة الخريف — جامعات',kind:'university',audience:'طلاب الجامعات',note:'تقويم شائع؛ قد تختلف البداية حسب الجامعة'},
  {start:'2027-01-08',end:'2027-01-16',name:'إجازة منتصف العام — جامعات',kind:'university',audience:'طلاب الجامعات',note:'تختلف بعض الجامعات في بداية الإجازة'},
  {start:'2027-02-19',end:'2027-02-22',name:'إجازة يوم التأسيس — جامعات',kind:'university',audience:'طلاب الجامعات',note:'قد تختلف البداية حسب الجامعة'},
  {start:'2027-02-25',end:'2027-03-13',name:'إجازة عيد الفطر — جامعات',kind:'university',audience:'طلاب الجامعات',note:'تقويم شائع؛ بعض الجامعات تبدأ أبكر'},
  {start:'2027-05-06',end:'2027-05-22',name:'إجازة عيد الأضحى — جامعات',kind:'university',audience:'طلاب الجامعات',note:'تقويم شائع؛ قد تختلف البداية حسب الجامعة'}
];

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

function isIsoInRange(iso,start,end){
  return iso>=start&&iso<=end;
}

function isFitrPrivateHoliday(date,hijri){
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

function isPublicFitrHoliday(hijri){
  return (hijri.month===9&&hijri.day>=25)||(hijri.month===10&&hijri.day<=5);
}

function isPublicAdhaHoliday(hijri){
  return hijri.month===12&&hijri.day>=5&&hijri.day<=15;
}

function isPrivateAdhaHoliday(hijri){
  return hijri.month===12&&hijri.day>=9&&hijri.day<=12;
}

function pushUniqueEvent(events,event){
  if(!event||!event.name)return;
  const key=`${event.name}|${event.audience||''}`;
  if(events.some(item=>`${item.name}|${item.audience||''}`===key))return;
  events.push(event);
}

function getSaudiCalendarEvents(iso){
  const date=dateAtNoon(iso);
  if(Number.isNaN(date.getTime()))return [];

  const events=[];
  const month=date.getMonth()+1;
  const day=date.getDate();
  const hijri=hijriPartsForDate(date);

  if(month===2&&day===22){
    pushUniqueEvent(events,{name:'يوم التأسيس',kind:'national',audience:'قطاع عام وخاص + تعليم'});
  }
  if(month===9&&day===23){
    pushUniqueEvent(events,{name:'اليوم الوطني السعودي',kind:'national',audience:'قطاع عام وخاص + تعليم'});
  }

  if(isPublicFitrHoliday(hijri)){
    pushUniqueEvent(events,{name:'إجازة عيد الفطر — قطاع حكومي',kind:'public',audience:'موظفو القطاع العام'});
  }
  if(isFitrPrivateHoliday(date,hijri)){
    pushUniqueEvent(events,{name:'إجازة عيد الفطر — قطاع خاص',kind:'private',audience:'موظفو القطاع الخاص'});
  }
  if(isPublicAdhaHoliday(hijri)){
    pushUniqueEvent(events,{name:'إجازة عيد الأضحى — قطاع حكومي',kind:'public',audience:'موظفو القطاع العام'});
  }
  if(isPrivateAdhaHoliday(hijri)){
    pushUniqueEvent(events,{name:'إجازة عيد الأضحى — قطاع خاص',kind:'private',audience:'موظفو القطاع الخاص'});
  }

  SCHOOL_HOLIDAYS_1448_1449.forEach(event=>{
    if(isIsoInRange(iso,event.start,event.end))pushUniqueEvent(events,event);
  });

  UNIVERSITY_COMMON_HOLIDAYS_1448_1449.forEach(event=>{
    if(isIsoInRange(iso,event.start,event.end))pushUniqueEvent(events,event);
  });

  return events;
}

function getSaudiOfficialHoliday(iso){
  return getSaudiCalendarEvents(iso)[0]||null;
}

window.getSaudiCalendarEvents=getSaudiCalendarEvents;
window.getSaudiOfficialHoliday=getSaudiOfficialHoliday;

function installEnhancementStyles(){
  if(document.getElementById('portalBookingEnhancementStyles'))return;
  const style=document.createElement('style');
  style.id='portalBookingEnhancementStyles';
  style.textContent=`
    body.booking-confirmation-open{overflow:hidden}
    .booking-easy-hint{display:grid;gap:4px;margin:18px 0 12px;padding:14px 15px;border:1px solid #9fcbb9;border-radius:8px;background:#e9f5ef;color:#174f40}
    .booking-easy-hint strong{font-size:17px}
    .booking-easy-hint span{font-size:13px;line-height:1.65}
    .calendar-day.available{border-color:#b8d8cb}
    .calendar-day.available .booking-day-cta{background:#d7efe5;color:#0f6649;font-size:10px;font-weight:900}
    .calendar-day.available:hover,.calendar-day.available:focus-visible{border-color:#2f7661;box-shadow:0 0 0 3px rgba(47,118,97,.16)}
    .calendar-day.saudi-holiday{border-color:#c99b42;box-shadow:inset 0 0 0 1px rgba(201,155,66,.18)}
    .calendar-day .saudi-holiday-badge{margin-top:4px;padding:3px 5px;border-radius:5px;background:#f7ecd2;color:#765816;font-size:8.5px;font-weight:900;line-height:1.35;text-align:center}
    .calendar-day .saudi-holiday-more{margin-top:2px;color:#765816;font-size:8px;font-weight:800;text-align:center}
    .calendar-legend .holiday-dot{background:#c99b42}
    .holiday-calendar-note{width:100%;margin-top:4px;color:#687871;font-size:11px;font-weight:500;line-height:1.65}
    .selected-holiday-list{display:grid;gap:6px;margin-top:4px}
    .selected-holiday-line{display:grid;gap:1px;padding:7px 9px;border-radius:6px;background:#f7ecd2;color:#765816;font-weight:800}
    .selected-holiday-line small{font-weight:600;opacity:.9}
    .booking-confirmation-modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(4,25,20,.68);backdrop-filter:blur(5px)}
    .booking-confirmation-modal[hidden]{display:none}
    .booking-confirmation-card{position:relative;width:min(480px,100%);padding:26px;border-radius:12px;background:#fff;color:#16312a;box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .booking-confirmation-close{position:absolute;top:12px;left:12px;width:42px;height:42px;border:1px solid #dce3de;border-radius:50%;background:#f7f4ec;color:#103f35;font-size:25px;line-height:1;cursor:pointer}
    .booking-confirmation-kicker{margin:0 0 4px;color:#c99b42;font-size:13px;font-weight:900}
    .booking-confirmation-card h3{margin:0;padding-left:46px;color:#103f35;font-size:25px;line-height:1.35}
    .booking-confirmation-summary{display:grid;gap:8px;margin-top:20px;padding:16px;border:1px solid #dce3de;border-radius:8px;background:#f7f4ec}
    .booking-confirmation-summary span{display:flex;justify-content:space-between;gap:16px;color:#687871;font-size:14px}
    .booking-confirmation-summary strong{color:#16312a;text-align:left}
    .booking-confirmation-holiday{display:grid;gap:7px;margin:12px 0 0;padding:10px 12px;border-radius:7px;background:#f7ecd2;color:#765816;font-size:13px}
    .booking-confirmation-holiday[hidden]{display:none}
    .booking-confirmation-holiday div{display:grid;gap:1px;padding-bottom:7px;border-bottom:1px solid rgba(118,88,22,.16)}
    .booking-confirmation-holiday div:last-child{padding-bottom:0;border-bottom:0}
    .booking-confirmation-holiday strong{font-weight:900}
    .booking-confirmation-holiday small{font-size:11px;line-height:1.5}
    .booking-confirmation-note{margin:14px 0 0;color:#687871;font-size:13px;line-height:1.7}
    .booking-confirmation-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:20px}
    .booking-confirmation-whatsapp,.booking-confirmation-cancel{min-height:50px;display:flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:7px;font-weight:900;text-decoration:none;cursor:pointer}
    .booking-confirmation-whatsapp{border:1px solid #103f35;background:#103f35;color:#fff}
    .booking-confirmation-whatsapp.is-disabled{pointer-events:none;opacity:.48}
    .booking-confirmation-cancel{border:1px solid #dce3de;background:#fff;color:#103f35}
    @media(max-width:560px){
      .booking-confirmation-card{padding:22px 18px}
      .booking-confirmation-card h3{font-size:22px}
      .booking-confirmation-actions{grid-template-columns:1fr}
      .booking-confirmation-summary span{display:grid;gap:2px}
      .booking-confirmation-summary strong{text-align:right}
      .booking-easy-hint{margin-top:14px}
    }
  `;
  document.head.appendChild(style);
}

function ensureBookingHint(){
  const selectedCard=document.getElementById('selectedDayCard');
  if(!selectedCard||document.getElementById('bookingEasyHint'))return;
  const hint=document.createElement('div');
  hint.id='bookingEasyHint';
  hint.className='booking-easy-hint';
  hint.innerHTML='<strong>للحجز: اضغط على اليوم الأخضر</strong><span>سيظهر لك تأكيد بسيط، وبعدها نفتح واتساب برسالة جاهزة بالتاريخ. ما يحتاج تكتب شيء.</span>';
  selectedCard.parentNode.insertBefore(hint,selectedCard);
}

function ensureHolidayLegend(){
  const legend=document.querySelector('.calendar-legend');
  if(!legend)return;
  if(!legend.querySelector('[data-saudi-holiday-legend]')){
    const item=document.createElement('span');
    item.dataset.saudiHolidayLegend='true';
    item.innerHTML='<i class="holiday-dot"></i> إجازة/مناسبة';
    item.title='المناسبة لا تعني أن اليوم محجوز';
    legend.appendChild(item);
  }
  if(!legend.querySelector('.holiday-calendar-note')){
    const note=document.createElement('div');
    note.className='holiday-calendar-note';
    note.textContent='يشمل القطاع الحكومي والخاص وتقويم مدارس التعليم العام 1448–1449هـ. إجازات الجامعات الأكاديمية تختلف من جامعة لأخرى، لذلك يظهر التقويم الجامعي الشائع مع تنبيه عند الاختلاف.';
    legend.appendChild(note);
  }
}

function formatEventAudience(event){
  return [event.audience,event.note].filter(Boolean).join(' — ');
}

function annotateSaudiHolidays(){
  document.querySelectorAll('.calendar-day[data-date]').forEach(button=>{
    button.classList.remove('saudi-holiday');
    button.querySelectorAll('.saudi-holiday-badge,.saudi-holiday-more').forEach(node=>node.remove());
    delete button.dataset.saudiHoliday;

    if(button.classList.contains('available')){
      const status=button.querySelector('span');
      if(status){
        status.textContent='اضغط للحجز';
        status.classList.add('booking-day-cta');
      }
      button.title='اضغط لطلب حجز هذا اليوم';
    }

    const events=getSaudiCalendarEvents(button.dataset.date);
    if(!events.length)return;
    button.classList.add('saudi-holiday');
    button.dataset.saudiHoliday=events.map(event=>event.name).join('، ');

    events.slice(0,1).forEach(event=>{
      const badge=document.createElement('div');
      badge.className='saudi-holiday-badge';
      badge.textContent=event.name.replace(/ — .+$/,'');
      button.appendChild(badge);
    });
    if(events.length>1){
      const more=document.createElement('div');
      more.className='saudi-holiday-more';
      more.textContent=`+${events.length-1} إجازة/فئة`;
      button.appendChild(more);
    }

    const baseLabel=button.getAttribute('aria-label')||'';
    const eventNames=events.map(event=>event.name).join('، ');
    if(baseLabel&&!baseLabel.includes(eventNames))button.setAttribute('aria-label',`${baseLabel}، ${eventNames}`);
  });
  ensureBookingHint();
  ensureHolidayLegend();
}

function addSelectedHolidayLines(iso){
  if(typeof selectedDayCard==='undefined'||!selectedDayCard)return;
  selectedDayCard.querySelector('.selected-holiday-list')?.remove();
  const events=getSaudiCalendarEvents(iso);
  if(!events.length)return;

  const list=document.createElement('div');
  list.className='selected-holiday-list';
  events.forEach(event=>{
    const line=document.createElement('span');
    line.className='selected-holiday-line';
    line.innerHTML=`<b>${escapeText(event.name)}</b>${formatEventAudience(event)?`<small>${escapeText(formatEventAudience(event))}</small>`:''}`;
    list.appendChild(line);
  });

  const requestButton=selectedDayCard.querySelector('#bookingRequestButton');
  if(requestButton)selectedDayCard.insertBefore(list,requestButton);
  else selectedDayCard.appendChild(list);
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
      <p class="booking-confirmation-kicker">خطوة واحدة للحجز</p>
      <h3 id="bookingConfirmationTitle">هل ترغب بحجز هذا اليوم؟</h3>
      <div class="booking-confirmation-summary">
        <span><b>الميلادي</b><strong id="bookingConfirmationGregorian">—</strong></span>
        <span><b>الهجري</b><strong id="bookingConfirmationHijri">—</strong></span>
        <span id="bookingConfirmationPriceRow"><b>السعر</b><strong id="bookingConfirmationPrice">—</strong></span>
      </div>
      <div id="bookingConfirmationHoliday" class="booking-confirmation-holiday" hidden></div>
      <p class="booking-confirmation-note">اضغط «إكمال الحجز عبر واتساب» وسنجهز لك الرسالة تلقائيًا. الطلب لا يُعد مؤكدًا حتى موافقة الإدارة.</p>
      <div class="booking-confirmation-actions">
        <a id="bookingConfirmationWhatsapp" class="booking-confirmation-whatsapp" href="#" target="_blank" rel="noopener">إكمال الحجز عبر واتساب</a>
        <button class="booking-confirmation-cancel" type="button">اختيار يوم آخر</button>
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
  const events=getSaudiCalendarEvents(iso);
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
  if(events.length){
    holidayBox.innerHTML=events.map(event=>`<div><strong>${escapeText(event.name)}</strong>${formatEventAudience(event)?`<small>${escapeText(formatEventAudience(event))}</small>`:''}</div>`).join('');
    holidayBox.hidden=false;
  }else{
    holidayBox.hidden=true;
    holidayBox.innerHTML='';
  }

  const whatsapp=modal.querySelector('#bookingConfirmationWhatsapp');
  whatsapp.href=requestUrl;
  whatsapp.classList.toggle('is-disabled',!canRequest);
  whatsapp.setAttribute('aria-disabled',canRequest?'false':'true');
  whatsapp.textContent=canRequest?'إكمال الحجز عبر واتساب':'واتساب غير متاح حاليًا';

  modal._returnFocus=returnFocus||document.activeElement;
  modal.hidden=false;
  document.body.classList.add('booking-confirmation-open');
  (canRequest?whatsapp:modal.querySelector('.booking-confirmation-cancel')).focus();
}

installEnhancementStyles();
ensureBookingModal();
ensureBookingHint();
ensureHolidayLegend();

try{
  const originalRenderCalendar=renderCalendar;
  renderCalendar=function(){
    const result=originalRenderCalendar.apply(this,arguments);
    annotateSaudiHolidays();
    return result;
  };
}catch(error){
  console.warn('تعذر تفعيل تحسينات الحجز والإجازات في التقويم.',error);
}

try{
  const originalRenderSelectedDay=renderSelectedDay;
  renderSelectedDay=function(iso,unavailable){
    const result=originalRenderSelectedDay.apply(this,arguments);
    if(!unavailable)addSelectedHolidayLines(iso);
    return result;
  };
}catch(error){
  console.warn('تعذر إظهار الإجازات في تفاصيل اليوم.',error);
}

try{
  const originalCreateBookingRequestMessage=createBookingRequestMessage;
  createBookingRequestMessage=function(iso,pricing){
    const message=originalCreateBookingRequestMessage.apply(this,arguments);
    const events=getSaudiCalendarEvents(iso);
    if(!events.length)return message;
    const hijriLine=`- التاريخ الهجري: ${formatHijri(iso)}`;
    if(!message.includes(hijriLine))return message;
    const calendarLine=`- الإجازات/المناسبات: ${events.map(event=>event.name).join('، ')}`;
    return message.replace(hijriLine,`${hijriLine}\n${calendarLine}`);
  };
}catch(error){
  console.warn('تعذر إضافة الإجازات إلى رسالة واتساب.',error);
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
