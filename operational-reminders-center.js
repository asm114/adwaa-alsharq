(()=>{
'use strict';
if(window.__adwaaOperationalRemindersInstalled)return;
window.__adwaaOperationalRemindersInstalled=true;

const ENTRY_HOUR=15;
const ENTRY_MINUTE=30;
const DEFAULT_SNOOZE_MINUTES=30;
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
function bookingExitDateValue(booking){try{return typeof window.bookingExitDate==='function'?window.bookingExitDate(booking):booking.date}catch(_){return booking?.date||''}}
function bookingExitMoment(booking){try{const date=bookingExitDateValue(booking),times=typeof window.bookingTimes==='function'?window.bookingTimes(booking):null,parsed=parseArabicTime(times?.exit||'');if(!date||!parsed)return null;return atLocal(date,parsed.hour,parsed.minute)}catch(_){return null}}
function existingReminder(key){return notifications().find(item=>item?.reminderKey===key&&!item.resolvedAt)}
function snoozed(item){return !!(item?.snoozedUntil&&new Date(item.snoozedUntil).getTime()>Date.now())}
function addReminder(type,booking,message){const key=reminderKey(type,booking),existing=existingReminder(key);if(existing)return existing;const item={id:crypto.randomUUID(),type:'operational',message,bookingId:booking.id,createdAt:nowIso(),read:false,reminderKey:key,operationalType:type,snoozedUntil:'',resolvedAt:''};notifications().unshift(item);if(notifications().length>100)notifications().length=100;return item}
function resolveReminder(item){if(!item)return;item.read=true;item.resolvedAt=nowIso();item.snoozedUntil=''}
function snoozeReminder(item,minutes=DEFAULT_SNOOZE_MINUTES){if(!item)return;item.read=false;item.snoozedUntil=new Date(Date.now()+minutes*60000).toISOString()}
async function saveAndRender(){try{if(typeof window.persist==='function')await window.persist();else localStorage.setItem('adwaaDB',JSON.stringify(db()))}catch(error){console.warn('تعذر حفظ التنبيه التشغيلي',error)}try{window.renderNotifications?.()}catch(_){}try{window.renderAll?.()}catch(_){}}
function addAudit(action,booking,details,before,after){try{window.addAudit?.(action,'تنبيه تشغيلي',`${booking.name||''} — #${booking.code||''} — ${details}`,before,after)}catch(_){}}
async function setBookingStatus(booking,status,item){
  const before=booking.status;booking.status=status;booking.updatedAt=nowIso();
  resolveReminder(item);addAudit('تأكيد',booking,`${before} ← ${status}`,{status:before},{status});await saveAndRender();
}
function ensureModal(){if(document.getElementById('operationalReminderModal'))return;const modal=document.createElement('div');modal.id='operationalReminderModal';modal.className='modal';modal.innerHTML=`<div class="sheet" style="max-width:560px;margin:auto"><div class="sheet-head"><h2 id="operationalReminderTitle">تنبيه تشغيلي</h2><button class="close" id="operationalReminderClose" type="button">×</button></div><div id="operationalReminderBody" class="notice" style="line-height:1.9"></div><div class="actions" id="operationalReminderActions"></div></div>`;document.body.appendChild(modal);document.getElementById('operationalReminderClose').addEventListener('click',()=>closePrompt(true))}
function closePrompt(snooze=false){const modal=document.getElementById('operationalReminderModal'),item=modal?._reminderItem;if(snooze&&item){snoozeReminder(item,DEFAULT_SNOOZE_MINUTES);saveAndRender()}if(modal){modal.classList.remove('open');modal._reminderItem=null}promptOpen=false}
function escapeText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[char]))}
function showPrompt(item,booking){
  if(promptOpen||!item||!booking||snoozed(item))return;
  ensureModal();const modal=document.getElementById('operationalReminderModal'),title=document.getElementById('operationalReminderTitle'),body=document.getElementById('operationalReminderBody'),actions=document.getElementById('operationalReminderActions');modal._reminderItem=item;promptOpen=true;
  if(item.operationalType==='entry'){
    title.textContent='موعد دخول العميل';body.innerHTML=`<b>${escapeText(booking.name||'العميل')}</b> — #${escapeText(booking.code||'')}<br>بدأ وقت الدخول الساعة 3:30 مساءً.<br><b>هل دخل العميل؟</b>`;actions.innerHTML='<button class="primary" id="opsYes">نعم، دخل العميل</button><button class="secondary" id="opsLater">لا، ذكرني لاحقًا</button>';document.getElementById('opsYes').onclick=async()=>{modal.classList.remove('open');promptOpen=false;await setBookingStatus(booking,'تم الدخول',item)};document.getElementById('opsLater').onclick=()=>closePrompt(true);
  }else if(item.operationalType==='exit'){
    title.textContent='موعد خروج العميل';body.innerHTML=`<b>${escapeText(booking.name||'العميل')}</b> — #${escapeText(booking.code||'')}<br>وصل وقت الخروج المسجل للحجز.<br><b>هل خرج العميل؟</b>`;actions.innerHTML='<button class="primary" id="opsYes">نعم، خرج العميل</button><button class="secondary" id="opsLater">لا، ذكرني لاحقًا</button>';document.getElementById('opsYes').onclick=async()=>{modal.classList.remove('open');promptOpen=false;await setBookingStatus(booking,'تم الخروج',item)};document.getElementById('opsLater').onclick=()=>closePrompt(true);
  }else{promptOpen=false;return}
  modal.classList.add('open');
}
function resolveObsoleteReminders(){
  notifications().forEach(item=>{
    if(item?.type!=='operational'||item.resolvedAt)return;
    const booking=bookings().find(row=>row.id===item.bookingId);
    if(!booking||booking.status==='ملغي'){resolveReminder(item);return}
    if(item.operationalType==='entry'&&['تم الدخول','تم الخروج'].includes(booking.status))resolveReminder(item);
    if(item.operationalType==='exit'&&booking.status==='تم الخروج')resolveReminder(item);
    if(item.operationalType==='cleaning')resolveReminder(item);
  });
}
function collectDueReminders(){
  const now=new Date(),today=isoDate(now),due=[];
  for(const booking of bookings()){
    if(!activeBooking(booking))continue;
    if(booking.date===today&&!['تم الدخول','تم الخروج'].includes(booking.status)){
      const entryAt=atLocal(today,ENTRY_HOUR,ENTRY_MINUTE);if(entryAt&&now>=entryAt){const item=addReminder('entry',booking,`هل دخل العميل ${booking.name||''}؟`);if(!snoozed(item))due.push({item,booking,priority:1})}
    }
    if(booking.status!=='تم الخروج'){
      const exitAt=bookingExitMoment(booking);if(exitAt&&isoDate(exitAt)===today&&now>=exitAt){const item=addReminder('exit',booking,`هل خرج العميل ${booking.name||''}؟`);if(!snoozed(item))due.push({item,booking,priority:2})}
    }
  }
  return due.sort((a,b)=>a.priority-b.priority);
}
async function scan(){if(!db())return;const before=notifications().map(item=>`${item.id}:${item.resolvedAt||''}:${item.snoozedUntil||''}`).join('|');resolveObsoleteReminders();const due=collectDueReminders(),after=notifications().map(item=>`${item.id}:${item.resolvedAt||''}:${item.snoozedUntil||''}`).join('|');if(before!==after)await saveAndRender();if(!promptOpen&&due.length)showPrompt(due[0].item,due[0].booking)}
function start(){if(scanTimer)return;scan();scanTimer=setInterval(scan,60000);window.addEventListener('focus',scan);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan()});window.addEventListener('adwaa-subscription-updated',()=>setTimeout(scan,0))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300),{once:true});else setTimeout(start,300);
})();

(()=>{const script=document.createElement('script');script.async=false;script.src='worker-check-admin.js?v=20260819-1';script.onerror=()=>console.warn('تعذر تحميل تشييك العامل');document.head.appendChild(script)})();
