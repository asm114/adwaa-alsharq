(()=>{
'use strict';
if(window.__adwaaOperationalRemindersInstalled)return;
window.__adwaaOperationalRemindersInstalled=true;

const ENTRY_HOUR=15;
const ENTRY_MINUTE=30;
const DEFAULT_SNOOZE_MINUTES=120;
const MAX_POPUP_DEFERS=2;
let promptOpen=false;
let scanTimer=null;

const db=()=>window.db;
const bookings=()=>Array.isArray(db()?.bookings)?db().bookings:[];
const notifications=()=>{const state=db();if(!state)return[];state.notifications=Array.isArray(state.notifications)?state.notifications:[];return state.notifications};
const isoDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const nowIso=()=>new Date().toISOString();
const money=value=>typeof window.money==='function'?window.money(value):`${Math.max(0,Number(value||0)).toLocaleString('ar-SA')} ر.س`;
const remaining=booking=>Math.max(0,Number(booking?.total||0)-Number(booking?.paid||0));
const activeBooking=booking=>booking&&booking.recordType!=='family'&&booking.status!=='ملغي';
const reminderKey=(type,booking)=>`ops:${type}:${booking.id}`;

function parseArabicTime(label){
  const text=String(label||'').trim(),match=text.match(/(\d{1,2})(?::(\d{2}))?/);if(!match)return null;
  let hour=Number(match[1]),minute=Number(match[2]||0);const pm=/مساء|م|pm/i.test(text),am=/صباح|ص|am/i.test(text);
  if(pm&&hour<12)hour+=12;if(am&&hour===12)hour=0;if(hour>23||minute>59)return null;return {hour,minute};
}
function atLocal(dateStr,hour,minute){if(!dateStr)return null;const value=new Date(`${dateStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`);return Number.isNaN(value.getTime())?null:value}
function addDaysLocalISO(dateStr,days){const date=new Date(`${dateStr}T12:00:00`);if(Number.isNaN(date.getTime()))return'';date.setDate(date.getDate()+Number(days||0));return isoDate(date)}
function bookingExitDateValue(booking){
  const entryDate=String(booking?.date||'');if(!entryDate)return'';
  if(booking?.type!=='مبيت')return addDaysLocalISO(entryDate,1);
  try{
    if(typeof window.bookingExitDate==='function'){
      const external=String(window.bookingExitDate(booking)||'');
      if(external&&external!==entryDate)return external;
    }
  }catch(_){}
  try{if(typeof window.bookingEndDate==='function'){const end=String(window.bookingEndDate(booking)||'');if(end)return end}}catch(_){}
  return addDaysLocalISO(entryDate,Math.max(1,Number(booking?.stayDays||1)));
}
function bookingExitMoment(booking){try{const date=bookingExitDateValue(booking),times=typeof window.bookingTimes==='function'?window.bookingTimes(booking):null,fallback=booking?.type==='مبيت'?'8:00 صباحًا':'3:00 صباحًا',parsed=parseArabicTime(times?.exit||fallback);if(!date||!parsed)return null;return atLocal(date,parsed.hour,parsed.minute)}catch(_){return null}}
function existingReminder(key){return notifications().find(item=>item?.reminderKey===key&&!item.resolvedAt)}
function snoozed(item){return !!(item?.snoozedUntil&&new Date(item.snoozedUntil).getTime()>Date.now())}
function popupDeferCount(item){return Math.max(0,Number(item?.popupDeferCount||0))}
function popupEligible(item){return !!item&&!item.popupSuppressed&&popupDeferCount(item)<MAX_POPUP_DEFERS&&!snoozed(item)}
function addReminder(type,booking,message){const key=reminderKey(type,booking),existing=existingReminder(key);if(existing)return existing;const item={id:crypto.randomUUID(),type:'operational',message,bookingId:booking.id,createdAt:nowIso(),read:false,reminderKey:key,operationalType:type,snoozedUntil:'',resolvedAt:'',popupDeferCount:0,popupSuppressed:false};notifications().unshift(item);if(notifications().length>100)notifications().length=100;return item}
function resolveReminder(item){if(!item)return;item.read=true;item.resolvedAt=nowIso();item.snoozedUntil='';item.popupSuppressed=true}
function deferReminder(item,minutes=DEFAULT_SNOOZE_MINUTES){if(!item)return;item.read=false;item.popupDeferCount=popupDeferCount(item)+1;if(item.popupDeferCount>=MAX_POPUP_DEFERS){item.popupSuppressed=true;item.snoozedUntil=''}else{item.snoozedUntil=new Date(Date.now()+minutes*60000).toISOString()}}
async function saveAndRender(){try{if(typeof window.persist==='function')await window.persist();else localStorage.setItem('adwaaDB',JSON.stringify(db()))}catch(error){console.warn('تعذر حفظ التنبيه التشغيلي',error)}try{window.renderNotifications?.()}catch(_){}try{window.renderAll?.()}catch(_){}}
function addAudit(action,booking,details,before,after){try{window.addAudit?.(action,'تنبيه تشغيلي',`${booking.name||''} — #${booking.code||''} — ${details}`,before,after)}catch(_){}}
async function setBookingStatus(booking,status,item){
  const before=booking.status;booking.status=status;booking.updatedAt=nowIso();
  resolveReminder(item);addAudit('تأكيد',booking,`${before} ← ${status}`,{status:before},{status});await saveAndRender();return true;
}
function dueMovementRows(now=new Date()){
  const today=isoDate(now),rows=[];
  for(const booking of bookings()){
    if(!activeBooking(booking))continue;
    if(booking.date===today&&!['تم الدخول','تم الخروج'].includes(booking.status)){
      const entryAt=atLocal(today,ENTRY_HOUR,ENTRY_MINUTE);
      if(entryAt&&now>=entryAt)rows.push({type:'entry',targetStatus:'تم الدخول',booking,at:entryAt});
    }
    if(booking.status==='تم الدخول'){
      const exitAt=bookingExitMoment(booking);
      if(exitAt&&isoDate(exitAt)===today&&now>=exitAt)rows.push({type:'exit',targetStatus:'تم الخروج',booking,at:exitAt});
    }
  }
  return rows;
}
async function confirmOperationalMovement(bookingId,targetStatus){
  const booking=bookings().find(row=>String(row?.id)===String(bookingId));
  if(!activeBooking(booking))return false;
  const type=targetStatus==='تم الدخول'?'entry':targetStatus==='تم الخروج'?'exit':'';
  if(!type)return false;
  if(type==='entry'&&['تم الدخول','تم الخروج'].includes(booking.status))return true;
  if(type==='exit'&&booking.status==='تم الخروج')return true;
  if(type==='exit'&&booking.status!=='تم الدخول')return false;
  const item=existingReminder(reminderKey(type,booking));
  return setBookingStatus(booking,targetStatus,item);
}
function ensureModal(){if(document.getElementById('operationalReminderModal'))return;const modal=document.createElement('div');modal.id='operationalReminderModal';modal.className='modal';modal.innerHTML=`<div class="sheet" style="max-width:560px;margin:auto"><div class="sheet-head"><h2 id="operationalReminderTitle">تنبيه تشغيلي</h2><button class="close" id="operationalReminderClose" type="button">×</button></div><div id="operationalReminderBody" class="notice" style="line-height:1.9"></div><div class="actions" id="operationalReminderActions"></div></div>`;document.body.appendChild(modal);document.getElementById('operationalReminderClose').addEventListener('click',()=>closePrompt(true))}
function closePrompt(defer=false){const modal=document.getElementById('operationalReminderModal'),item=modal?._reminderItem;if(defer&&item){deferReminder(item,DEFAULT_SNOOZE_MINUTES);saveAndRender()}if(modal){modal.classList.remove('open');modal._reminderItem=null}promptOpen=false}
function escapeText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))}
function laterButtonLabel(item){return popupDeferCount(item)>=1?'إغلاق وإبقاؤه في التنبيهات':'لا، ذكرني بعد ساعتين'}
function showPrompt(item,booking){
  if(promptOpen||!item||!booking||!popupEligible(item))return;
  ensureModal();const modal=document.getElementById('operationalReminderModal'),title=document.getElementById('operationalReminderTitle'),body=document.getElementById('operationalReminderBody'),actions=document.getElementById('operationalReminderActions');modal._reminderItem=item;promptOpen=true;const laterLabel=escapeText(laterButtonLabel(item));
  if(item.operationalType==='entry'){
    title.textContent='موعد دخول العميل';body.innerHTML=`<b>${escapeText(booking.name||'العميل')}</b> — #${escapeText(booking.code||'')}<br>بدأ وقت الدخول الساعة 3:30 مساءً.<br><b>هل دخل العميل؟</b>`;actions.innerHTML=`<button class="primary" id="opsYes">نعم، دخل العميل</button><button class="secondary" id="opsLater">${laterLabel}</button>`;document.getElementById('opsYes').onclick=async()=>{modal.classList.remove('open');promptOpen=false;await confirmOperationalMovement(booking.id,'تم الدخول')};document.getElementById('opsLater').onclick=()=>closePrompt(true);
  }else if(item.operationalType==='exit'){
    title.textContent='موعد خروج العميل';body.innerHTML=`<b>${escapeText(booking.name||'العميل')}</b> — #${escapeText(booking.code||'')}<br>وصل وقت الخروج المسجل للحجز.<br><b>هل خرج العميل؟</b>`;actions.innerHTML=`<button class="primary" id="opsYes">نعم، خرج العميل</button><button class="secondary" id="opsLater">${laterLabel}</button>`;document.getElementById('opsYes').onclick=async()=>{modal.classList.remove('open');promptOpen=false;await confirmOperationalMovement(booking.id,'تم الخروج')};document.getElementById('opsLater').onclick=()=>closePrompt(true);
  }else{promptOpen=false;return}
  modal.classList.add('open');
}
function resolveObsoleteReminders(){
  const now=Date.now();
  notifications().forEach(item=>{
    if(item?.type!=='operational'||item.resolvedAt)return;
    const booking=bookings().find(row=>row.id===item.bookingId);
    if(!booking||booking.status==='ملغي'){resolveReminder(item);return}
    if(item.operationalType==='entry'&&['تم الدخول','تم الخروج'].includes(booking.status))resolveReminder(item);
    if(item.operationalType==='exit'){
      const exitAt=bookingExitMoment(booking);
      if(booking.status==='تم الخروج'||booking.status!=='تم الدخول'||!exitAt||now<exitAt.getTime())resolveReminder(item);
    }
    if(item.operationalType==='cleaning')resolveReminder(item);
  });
}
function collectDueReminders(){
  const due=[];
  for(const row of dueMovementRows(new Date())){
    const booking=row.booking,message=row.type==='entry'?`هل دخل العميل ${booking.name||''}؟`:`هل خرج العميل ${booking.name||''}؟`,item=addReminder(row.type,booking,message);
    if(popupEligible(item))due.push({item,booking,priority:row.type==='entry'?1:2});
  }
  return due.sort((a,b)=>a.priority-b.priority);
}
async function scan(){if(!db())return;const before=notifications().map(item=>`${item.id}:${item.resolvedAt||''}:${item.snoozedUntil||''}:${item.popupDeferCount||0}:${item.popupSuppressed===true}`).join('|');resolveObsoleteReminders();const due=collectDueReminders(),after=notifications().map(item=>`${item.id}:${item.resolvedAt||''}:${item.snoozedUntil||''}:${item.popupDeferCount||0}:${item.popupSuppressed===true}`).join('|');if(before!==after)await saveAndRender();if(!promptOpen&&due.length)showPrompt(due[0].item,due[0].booking)}
function start(){if(scanTimer)return;scan();scanTimer=setInterval(scan,60000);window.addEventListener('focus',scan);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan()});window.addEventListener('adwaa-subscription-updated',()=>setTimeout(scan,0))}
window.getDueOperationalMovements=()=>dueMovementRows(new Date());
window.confirmOperationalMovement=confirmOperationalMovement;
window.dispatchEvent(new CustomEvent('adwaa-operational-reminders-ready'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300),{once:true});else setTimeout(start,300);
})();

(()=>{const script=document.createElement('script');script.async=false;script.src='worker-check-admin.js?v=20260819-2';script.onerror=()=>console.warn('تعذر تحميل تشييك العامل');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='worker-check-legacy-cleanup.js?v=20260819-2';script.onerror=()=>console.warn('تعذر تنظيف واجهات التنظيف القديمة');document.head.appendChild(script)})();
