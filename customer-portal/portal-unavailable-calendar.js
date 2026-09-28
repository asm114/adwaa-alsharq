const portalOriginalRenderUnavailablePeriods=window.renderPortalUnavailablePeriods;
let portalUnavailableCalendarMonth=new Date();
portalUnavailableCalendarMonth=new Date(Date.UTC(portalUnavailableCalendarMonth.getUTCFullYear(),portalUnavailableCalendarMonth.getUTCMonth(),1));
let portalUnavailableCalendarBusy=false;

function portalCalendarIso(date){
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function portalCalendarDate(iso){
  const [year,month,day]=String(iso||'').split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day));
}

function portalCalendarShiftDate(iso,days){
  const date=portalCalendarDate(iso);
  date.setUTCDate(date.getUTCDate()+days);
  return portalCalendarIso(date);
}

function portalCalendarContains(period,iso){
  return period.start_date<=iso&&period.end_date>=iso;
}

function portalCalendarFormat(date,calendar,options){
  return new Intl.DateTimeFormat(`ar-SA-u-ca-${calendar}`,{timeZone:'UTC',...options}).format(date);
}

function portalCalendarMonthLabel(){
  const gregorian=portalCalendarFormat(portalUnavailableCalendarMonth,'gregory',{month:'long',year:'numeric'});
  const hijri=portalCalendarFormat(portalUnavailableCalendarMonth,'islamic-umalqura',{month:'long',year:'numeric'});
  return {gregorian,hijri};
}

function portalCalendarDayLabels(date){
  return {
    weekday:portalCalendarFormat(date,'gregory',{weekday:'long'}),
    gregorian:portalCalendarFormat(date,'gregory',{day:'numeric',month:'short'}),
    gregorianFull:portalCalendarFormat(date,'gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),
    hijri:portalCalendarFormat(date,'islamic-umalqura',{day:'numeric',month:'short'}),
    hijriFull:portalCalendarFormat(date,'islamic-umalqura',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  };
}

function portalCalendarInstallStyles(){
  if(document.getElementById('portalUnavailableCalendarStyles'))return;
  const style=document.createElement('style');
  style.id='portalUnavailableCalendarStyles';
  style.textContent=`
    .portal-calendar-shell{margin:16px 0 20px;border:1px solid #ded9cd;border-radius:18px;background:#fff;padding:14px}
    .portal-calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
    .portal-calendar-title{text-align:left;color:#123d32}
    .portal-calendar-title h4{margin:0;font-size:20px;color:#123d32}
    .portal-calendar-title .portal-calendar-hijri-month{display:block;margin-top:4px;color:#66756f;font-size:13px;font-weight:800}
    .portal-calendar-actions{display:flex;gap:8px;flex-wrap:wrap}
    .portal-calendar-help{margin:0 0 12px;color:#60726b;font-weight:700}
    .portal-calendar-legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;font-weight:800}
    .portal-calendar-legend span{display:inline-flex;align-items:center;gap:6px}
    .portal-calendar-dot{width:14px;height:14px;border-radius:4px;border:1px solid #cfc9bc;background:#fff}
    .portal-calendar-dot.unavailable{background:#9b342f;border-color:#9b342f}
    .portal-calendar-weekdays,.portal-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
    .portal-calendar-weekdays div{text-align:center;font-weight:900;color:#48635a;padding:7px 2px;font-size:13px}
    .portal-calendar-day{position:relative;min-height:104px;border:1px solid #ddd8cb;border-radius:12px;background:#fff;color:#173a31;padding:8px;cursor:pointer;text-align:right;font:inherit;transition:.15s ease}
    .portal-calendar-day:hover{transform:translateY(-1px);border-color:#2d6b5a;box-shadow:0 4px 12px rgba(30,70,58,.1)}
    .portal-calendar-day.outside{opacity:.42;background:#f7f5ef}
    .portal-calendar-day.unavailable{background:#9b342f;color:#fff;border-color:#872c28}
    .portal-calendar-day.today{outline:3px solid #d2a53a;outline-offset:1px}
    .portal-calendar-day:disabled{cursor:wait;opacity:.65}
    .portal-calendar-weekday{display:block;font-size:11px;font-weight:900;opacity:.86}
    .portal-calendar-number{display:block;margin-top:2px;font-size:22px;font-weight:900;line-height:1}
    .portal-calendar-gregorian{display:block;margin-top:6px;font-size:11px;line-height:1.35;font-weight:800;opacity:.9}
    .portal-calendar-hijri{display:block;margin-top:3px;font-size:11px;line-height:1.35;opacity:.82}
    .portal-calendar-state{display:inline-block;margin-top:6px;font-size:11px;font-weight:900;padding:3px 6px;border-radius:999px;background:rgba(18,61,50,.08)}
    .portal-calendar-day.unavailable .portal-calendar-state{background:rgba(255,255,255,.18)}
    .portal-calendar-status{min-height:24px;margin:8px 0 0;font-weight:800;color:#48635a}
    @media(max-width:760px){
      .portal-calendar-shell{padding:10px}
      .portal-calendar-title{text-align:right;width:100%}
      .portal-calendar-weekdays,.portal-calendar-grid{gap:4px}
      .portal-calendar-weekdays div{font-size:10px;padding:5px 0}
      .portal-calendar-day{min-height:84px;padding:5px;border-radius:9px}
      .portal-calendar-weekday{font-size:9px}
      .portal-calendar-number{font-size:17px}
      .portal-calendar-gregorian,.portal-calendar-hijri{font-size:9px}
      .portal-calendar-state{font-size:9px;padding:2px 5px}
    }
  `;
  document.head.appendChild(style);
}

function portalCalendarDaysHtml(){
  const year=portalUnavailableCalendarMonth.getUTCFullYear();
  const month=portalUnavailableCalendarMonth.getUTCMonth();
  const firstWeekday=portalUnavailableCalendarMonth.getUTCDay();
  const gridStart=new Date(Date.UTC(year,month,1-firstWeekday));
  const today=portalCalendarIso(new Date());
  const buttons=[];
  for(let index=0;index<42;index+=1){
    const date=new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate()+index);
    const iso=portalCalendarIso(date);
    const outside=date.getUTCMonth()!==month;
    const unavailable=portalUnavailablePeriods.some(period=>portalCalendarContains(period,iso));
    const labels=portalCalendarDayLabels(date);
    const classes=['portal-calendar-day'];
    if(outside)classes.push('outside');
    if(unavailable)classes.push('unavailable');
    if(iso===today)classes.push('today');
    buttons.push(`<button type="button" class="${classes.join(' ')}" data-portal-calendar-date="${iso}" aria-pressed="${unavailable?'true':'false'}" title="${unavailable?'اضغط لجعل اليوم متاحًا':'اضغط لجعل اليوم غير متاح'} — ${escapeHtml(labels.gregorianFull)} — ${escapeHtml(labels.hijriFull)}">
      <span class="portal-calendar-weekday">${escapeHtml(labels.weekday)}</span>
      <span class="portal-calendar-number">${date.getUTCDate()}</span>
      <span class="portal-calendar-gregorian">ميلادي: ${escapeHtml(labels.gregorian)}</span>
      <span class="portal-calendar-hijri">هجري: ${escapeHtml(labels.hijri)}</span>
      <span class="portal-calendar-state">${unavailable?'غير متاح':'متاح'}</span>
    </button>`);
  }
  return buttons.join('');
}

function portalCalendarHtml(){
  const monthLabel=portalCalendarMonthLabel();
  return `<section class="portal-calendar-shell" aria-label="تقويم تحديد الأيام غير المتاحة">
    <div class="portal-calendar-toolbar">
      <div class="portal-calendar-actions">
        <button class="secondary" type="button" data-portal-calendar-nav="prev">الشهر السابق</button>
        <button class="secondary" type="button" data-portal-calendar-nav="today">هذا الشهر</button>
        <button class="secondary" type="button" data-portal-calendar-nav="next">الشهر التالي</button>
      </div>
      <div class="portal-calendar-title">
        <h4>ميلادي: ${escapeHtml(monthLabel.gregorian)}</h4>
        <span class="portal-calendar-hijri-month">هجري: ${escapeHtml(monthLabel.hijri)}</span>
      </div>
    </div>
    <p class="portal-calendar-help">اضغط على اليوم مباشرة لتبديله بين متاح وغير متاح. كل خانة تعرض اليوم والتاريخ الميلادي والهجري.</p>
    <div class="portal-calendar-legend"><span><i class="portal-calendar-dot"></i> متاح</span><span><i class="portal-calendar-dot unavailable"></i> غير متاح</span></div>
    <div class="portal-calendar-weekdays"><div>الأحد</div><div>الاثنين</div><div>الثلاثاء</div><div>الأربعاء</div><div>الخميس</div><div>الجمعة</div><div>السبت</div></div>
    <div class="portal-calendar-grid">${portalCalendarDaysHtml()}</div>
    <div id="portalCalendarStatus" class="portal-calendar-status" role="status"></div>
  </section>`;
}

function renderPortalUnavailableCalendarAndTable(){
  const root=document.getElementById('portalUnavailableList');
  if(!root)return;
  root.innerHTML=`${portalCalendarHtml()}<div id="portalUnavailableTableHost"></div>`;
  const host=document.getElementById('portalUnavailableTableHost');
  root.id='portalUnavailableListRoot';
  host.id='portalUnavailableList';
  portalOriginalRenderUnavailablePeriods();
  host.id='portalUnavailableTableHost';
  root.id='portalUnavailableList';
  portalCalendarBindEvents();
}
window.renderPortalUnavailablePeriods=renderPortalUnavailableCalendarAndTable;

function portalCalendarBindEvents(){
  document.querySelectorAll('[data-portal-calendar-nav]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.portalCalendarNav;
    if(action==='today'){
      const now=new Date();
      portalUnavailableCalendarMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
    }else{
      portalUnavailableCalendarMonth=new Date(Date.UTC(
        portalUnavailableCalendarMonth.getUTCFullYear(),
        portalUnavailableCalendarMonth.getUTCMonth()+(action==='next'?1:-1),
        1
      ));
    }
    renderPortalUnavailableCalendarAndTable();
  }));
  document.querySelectorAll('[data-portal-calendar-date]').forEach(button=>button.addEventListener('click',()=>togglePortalUnavailableCalendarDate(button.dataset.portalCalendarDate)));
}

function portalCalendarStatus(message,type=''){
  const el=document.getElementById('portalCalendarStatus');
  if(!el)return;
  el.textContent=message;
  el.style.color=type==='error'?'#9b342f':'#48635a';
}

async function portalCalendarAddDate(iso){
  return supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).insert({
    start_date:iso,
    end_date:iso,
    updated_by:currentUser?.id||null
  });
}

async function portalCalendarRemoveDate(period,iso){
  if(period.start_date===period.end_date){
    return supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).delete().eq('id',period.id);
  }
  if(iso===period.start_date){
    return supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).update({start_date:portalCalendarShiftDate(iso,1),updated_by:currentUser?.id||null}).eq('id',period.id);
  }
  if(iso===period.end_date){
    return supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).update({end_date:portalCalendarShiftDate(iso,-1),updated_by:currentUser?.id||null}).eq('id',period.id);
  }
  const originalEnd=period.end_date;
  const first=await supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).update({end_date:portalCalendarShiftDate(iso,-1),updated_by:currentUser?.id||null}).eq('id',period.id);
  if(first.error)return first;
  const second=await supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).insert({
    start_date:portalCalendarShiftDate(iso,1),
    end_date:originalEnd,
    updated_by:currentUser?.id||null
  });
  if(second.error){
    await supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).update({end_date:originalEnd,updated_by:currentUser?.id||null}).eq('id',period.id);
  }
  return second;
}

async function togglePortalUnavailableCalendarDate(iso){
  if(portalUnavailableCalendarBusy||!portalAdminAuthorized)return;
  portalUnavailableCalendarBusy=true;
  document.querySelectorAll('[data-portal-calendar-date]').forEach(button=>button.disabled=true);
  const period=portalUnavailablePeriods.find(item=>portalCalendarContains(item,iso));
  portalCalendarStatus(period?'جاري جعل اليوم متاحًا...':'جاري جعل اليوم غير متاح...');
  try{
    const result=period?await portalCalendarRemoveDate(period,iso):await portalCalendarAddDate(iso);
    if(result.error)throw result.error;
    await loadPortalUnavailablePeriods();
    await loadPortalFinalSummary();
    portalCalendarStatus(period?'تم جعل اليوم متاحًا.':'تم جعل اليوم غير متاح.');
  }catch(error){
    console.error(error);
    portalCalendarStatus('تعذر حفظ حالة اليوم. لم يتم اعتماد التغيير.','error');
    document.querySelectorAll('[data-portal-calendar-date]').forEach(button=>button.disabled=false);
  }finally{
    portalUnavailableCalendarBusy=false;
  }
}

portalCalendarInstallStyles();