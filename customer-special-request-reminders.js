(()=>{
'use strict';
if(window.__adwaaCustomerSpecialRequestRemindersInstalled)return;
window.__adwaaCustomerSpecialRequestRemindersInstalled=true;

const CONFIG_PREFIX='__special_request__:';
const SPECIAL_TYPE='special_request';
const DEFAULT_DAYS_BEFORE=1;
let scanTimer=null;
let renderWrapTimer=null;
let customerWrapTimer=null;

const state=()=>window.db;
const bookings=()=>Array.isArray(state()?.bookings)?state().bookings:[];
const notes=()=>{const db=state();if(!db)return{};db.customerNotes=db.customerNotes&&typeof db.customerNotes==='object'?db.customerNotes:{};return db.customerNotes};
const notifications=()=>{const db=state();if(!db)return[];db.notifications=Array.isArray(db.notifications)?db.notifications:[];return db.notifications};
const esc=value=>typeof window.escapeHtml==='function'?window.escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const isoDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const todayIso=()=>isoDate(new Date());
const normalizePhone=value=>String(value||'').replace(/\D/g,'');
const customerKeyFromBooking=booking=>normalizePhone(booking?.phone)||String(booking?.name||'').trim().toLowerCase();
const configStorageKey=customerKey=>`${CONFIG_PREFIX}${customerKey}`;
const activeBooking=booking=>booking&&booking.recordType!=='family'&&!['ملغي','تم الدخول','تم الخروج'].includes(String(booking.status||''));

function parseDate(value){
  const parts=String(value||'').split('-').map(Number);
  if(parts.length!==3||parts.some(part=>!Number.isFinite(part)))return null;
  const date=new Date(parts[0],parts[1]-1,parts[2],12,0,0,0);
  return Number.isNaN(date.getTime())?null:date;
}
function shiftDate(value,days){const date=parseDate(value);if(!date)return'';date.setDate(date.getDate()+Number(days||0));return isoDate(date)}
function daysUntil(value){const target=parseDate(value),today=parseDate(todayIso());if(!target||!today)return null;return Math.round((target-today)/86400000)}
function readConfig(customerKey){
  if(!customerKey)return null;
  const raw=notes()[configStorageKey(customerKey)];
  if(!raw)return null;
  try{
    const parsed=typeof raw==='string'?JSON.parse(raw):raw;
    if(!parsed||typeof parsed!=='object')return null;
    return {
      enabled:parsed.enabled===true,
      text:String(parsed.text||'').trim(),
      daysBefore:Math.min(7,Math.max(1,Number(parsed.daysBefore||DEFAULT_DAYS_BEFORE))),
      updatedAt:String(parsed.updatedAt||'legacy')
    };
  }catch(_){return null}
}
function writeConfig(customerKey,config){notes()[configStorageKey(customerKey)]=JSON.stringify(config)}
function specialReminderKey(booking,config){return `ops:${SPECIAL_TYPE}:${booking.id}:${booking.date}:${config.updatedAt}`}
function dueRows(){
  const today=todayIso(),rows=[];
  for(const booking of bookings()){
    if(!activeBooking(booking))continue;
    const customerKey=customerKeyFromBooking(booking),config=readConfig(customerKey);
    if(!config?.enabled||!config.text)continue;
    const triggerDate=shiftDate(booking.date,-config.daysBefore);
    if(!triggerDate||today<triggerDate||today>booking.date)continue;
    rows.push({booking,customerKey,config,triggerDate,key:specialReminderKey(booking,config)});
  }
  return rows.sort((a,b)=>String(a.booking.date).localeCompare(String(b.booking.date)));
}
function findNotification(key){return notifications().find(item=>item?.reminderKey===key)}
function unresolvedNotification(key){const item=findNotification(key);return item&&!item.resolvedAt?item:null}
function ensureNotification(row){
  let item=findNotification(row.key);
  if(item)return item;
  item={id:crypto.randomUUID?.()||`special-${Date.now()}-${Math.random().toString(16).slice(2)}`,type:'operational',operationalType:SPECIAL_TYPE,message:`طلب خاص قبل وصول ${row.booking.name||'العميل'}: ${row.config.text}`,bookingId:row.booking.id,customerKey:row.customerKey,bookingDate:row.booking.date,reminderKey:row.key,createdAt:new Date().toISOString(),read:false,resolvedAt:'',popupSuppressed:true};
  notifications().unshift(item);
  if(notifications().length>120)notifications().length=120;
  return item;
}
function resolveObsolete(expectedKeys){
  let changed=false;
  for(const item of notifications()){
    if(item?.operationalType!==SPECIAL_TYPE||item.resolvedAt)continue;
    if(!expectedKeys.has(String(item.reminderKey||''))){item.read=true;item.resolvedAt=new Date().toISOString();item.popupSuppressed=true;changed=true}
  }
  return changed;
}
async function persistAndRefresh(){
  try{if(typeof window.persist==='function')await window.persist();else localStorage.setItem('adwaaDB',JSON.stringify(state()))}catch(error){console.warn('تعذر حفظ تنبيه الطلب الخاص',error)}
  try{window.renderAlerts?.()}catch(_){}
  try{window.renderNotifications?.()}catch(_){}
  try{window.syncHeaderAlertCount?.()}catch(_){}
}
async function scanSpecialRequests({persist=true}={}){
  if(!state())return[];
  const rows=dueRows(),expected=new Set(rows.map(row=>row.key));
  let changed=resolveObsolete(expected);
  for(const row of rows){if(!findNotification(row.key)){ensureNotification(row);changed=true}}
  if(changed&&persist)await persistAndRefresh();else renderSpecialAlertCards();
  return rows.filter(row=>unresolvedNotification(row.key));
}

function installStyles(){
  if(document.getElementById('customerSpecialRequestStyles'))return;
  const style=document.createElement('style');style.id='customerSpecialRequestStyles';style.textContent=`
    .customer-special-request-card{margin-top:12px;border:1px solid #ead39a;background:#fffaf0;border-radius:18px;padding:14px}.customer-special-request-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.customer-special-request-title h3{margin:0;font-size:17px}.customer-special-toggle{display:inline-flex;align-items:center;gap:8px;font-weight:900;color:#765816}.customer-special-toggle input{width:auto}.customer-special-request-fields{display:grid;grid-template-columns:1fr 170px;gap:9px}.customer-special-request-fields textarea{min-height:74px}.customer-special-help{grid-column:1/-1;color:var(--muted);font-size:12px;line-height:1.7}.customer-special-actions{grid-column:1/-1;display:flex;gap:8px;align-items:center}.customer-special-status{font-size:12px;color:#14785f;font-weight:800}.special-request-alert{border-color:#ead39a!important;background:#fffaf0!important}.special-request-alert .action-alert-icon{background:#f8e7b9!important;color:#765816!important}
    @media(max-width:620px){.customer-special-request-fields{grid-template-columns:1fr}.customer-special-help,.customer-special-actions{grid-column:auto}}
  `;document.head.appendChild(style);
}
function ensureCustomerSection(){
  const modal=document.getElementById('customerModal');if(!modal)return null;
  let card=document.getElementById('customerSpecialRequestCard');
  if(card)return card;
  installStyles();
  card=document.createElement('section');card.id='customerSpecialRequestCard';card.className='customer-special-request-card';card.innerHTML=`
    <div class="customer-special-request-title"><div><h3>⚠️ طلب خاص متكرر</h3><div class="meta">يظهر قبل كل حجز لهذا العميل، بما فيها حجوزات الاشتراك.</div></div><label class="customer-special-toggle"><input id="customerSpecialRequestEnabled" type="checkbox"> تفعيل</label></div>
    <div class="customer-special-request-fields">
      <label><span class="label">الطلب الخاص</span><textarea id="customerSpecialRequestText" maxlength="300" placeholder="مثال: تفريغ المسبح قبل وصول العميل"></textarea></label>
      <label><span class="label">موعد التنبيه</span><select id="customerSpecialRequestDays"><option value="1" selected>قبل الحجز بيوم</option><option value="2">قبل الحجز بيومين</option><option value="3">قبل الحجز بـ3 أيام</option></select></label>
      <div class="customer-special-help">التنبيه اختياري. إذا كان غير مفعّل فلن يظهر أي تنبيه لهذا العميل.</div>
      <div class="customer-special-actions"><button class="primary" id="customerSpecialRequestSave" type="button">حفظ الطلب الخاص</button><span id="customerSpecialRequestStatus" class="customer-special-status"></span></div>
    </div>`;
  const history=document.getElementById('customerBookingHistory')?.closest('.section');
  const notesSection=document.getElementById('customerAdminNotes')?.closest('.section');
  if(history?.parentElement)history.parentElement.insertBefore(card,history);else if(notesSection?.parentElement)notesSection.after(card);else modal.querySelector('.sheet')?.appendChild(card);
  card.querySelector('#customerSpecialRequestSave')?.addEventListener('click',saveCustomerSpecialRequest);
  card.querySelector('#customerSpecialRequestEnabled')?.addEventListener('change',updateSpecialFieldsState);
  return card;
}
function updateSpecialFieldsState(){
  const enabled=document.getElementById('customerSpecialRequestEnabled')?.checked===true;
  const text=document.getElementById('customerSpecialRequestText'),days=document.getElementById('customerSpecialRequestDays');
  if(text)text.disabled=!enabled;if(days)days.disabled=!enabled;
}
function currentCustomerKey(){return String(document.getElementById('customerProfileKey')?.value||'')}
function loadCustomerSpecialRequest(){
  const card=ensureCustomerSection();if(!card)return;
  const key=currentCustomerKey(),config=readConfig(key);
  const enabled=document.getElementById('customerSpecialRequestEnabled'),text=document.getElementById('customerSpecialRequestText'),days=document.getElementById('customerSpecialRequestDays'),status=document.getElementById('customerSpecialRequestStatus');
  if(enabled)enabled.checked=config?.enabled===true;if(text)text.value=config?.text||'';if(days)days.value=String(config?.daysBefore||DEFAULT_DAYS_BEFORE);if(status)status.textContent=config?.enabled?'التنبيه مفعّل لهذا العميل':'';updateSpecialFieldsState();
}
async function saveCustomerSpecialRequest(){
  const key=currentCustomerKey();if(!key)return;
  const enabled=document.getElementById('customerSpecialRequestEnabled')?.checked===true;
  const text=String(document.getElementById('customerSpecialRequestText')?.value||'').trim();
  const daysBefore=Math.min(7,Math.max(1,Number(document.getElementById('customerSpecialRequestDays')?.value||DEFAULT_DAYS_BEFORE)));
  if(enabled&&!text){alert('اكتب الطلب الخاص أولًا، أو أوقف التفعيل.');return}
  const before=readConfig(key),config={enabled,text,daysBefore,updatedAt:new Date().toISOString()};
  writeConfig(key,config);
  try{window.addAudit?.('تعديل','طلب خاص متكرر',key,before,config)}catch(_){}
  try{if(typeof window.persist==='function')await window.persist();else localStorage.setItem('adwaaDB',JSON.stringify(state()))}catch(error){console.warn('تعذر حفظ الطلب الخاص',error);alert('تعذر حفظ الطلب الخاص. حاول مرة أخرى.');return}
  const status=document.getElementById('customerSpecialRequestStatus');if(status)status.textContent=enabled?'تم الحفظ — التنبيه مفعّل':'تم الحفظ — التنبيه متوقف';
  await scanSpecialRequests();
}

function reminderLabel(bookingDate){const days=daysUntil(bookingDate);if(days===0)return'اليوم';if(days===1)return'غدًا';if(days>1)return`بعد ${days} أيام`;return'موعد قريب'}
function renderSpecialAlertCards(){
  const root=document.getElementById('alertsList');if(!root)return;
  root.querySelectorAll('.special-request-alert').forEach(card=>card.remove());
  const rows=dueRows().filter(row=>unresolvedNotification(row.key));
  if(!rows.length){window.syncHeaderAlertCount?.();return}
  const first=root.firstChild;
  for(const row of rows){
    const card=document.createElement('article');card.className='action-alert special-request-alert';card.dataset.specialRequest='1';card.dataset.bookingId=String(row.booking.id||'');
    card.innerHTML=`<span class="action-alert-icon">⚠️</span><div><h3>${esc(`طلب خاص ${reminderLabel(row.booking.date)} — ${row.booking.name||'العميل'}`)}</h3><p>${esc(row.config.text)} • موعد الحجز ${esc(row.booking.date)}</p></div><button type="button">تم التنفيذ</button>`;
    card.querySelector('button')?.addEventListener('click',()=>completeCustomerSpecialRequest(row.booking.id,row.key));
    root.insertBefore(card,first);
  }
  window.syncHeaderAlertCount?.();
}
async function completeCustomerSpecialRequest(bookingId,key){
  const item=findNotification(String(key||''));
  if(item){item.read=true;item.resolvedAt=new Date().toISOString();item.popupSuppressed=true}
  try{const booking=bookings().find(row=>String(row?.id)===String(bookingId));window.addAudit?.('إكمال','طلب خاص قبل الوصول',booking?.name||String(bookingId),null,{bookingId,reminderKey:key})}catch(_){}
  await persistAndRefresh();
  renderSpecialAlertCards();
}
window.completeCustomerSpecialRequest=completeCustomerSpecialRequest;
window.getDueCustomerSpecialRequests=()=>dueRows().filter(row=>unresolvedNotification(row.key));
window.saveCustomerSpecialRequest=saveCustomerSpecialRequest;
window.loadCustomerSpecialRequest=loadCustomerSpecialRequest;

function wrapRenderAlerts(){
  const current=window.renderAlerts;
  if(typeof current!=='function'){clearTimeout(renderWrapTimer);renderWrapTimer=setTimeout(wrapRenderAlerts,120);return}
  if(current.__customerSpecialRequestWrapped){renderSpecialAlertCards();return}
  const wrapped=function(...args){const result=current.apply(this,args);queueMicrotask(renderSpecialAlertCards);return result};
  wrapped.__customerSpecialRequestWrapped=true;wrapped.__base=current;window.renderAlerts=wrapped;try{renderAlerts=wrapped}catch(_){};renderSpecialAlertCards();
}
function wrapCustomerProfile(){
  const current=window.openCustomerProfile;
  if(typeof current!=='function'){clearTimeout(customerWrapTimer);customerWrapTimer=setTimeout(wrapCustomerProfile,120);return}
  if(current.__customerSpecialRequestWrapped)return;
  const wrapped=function(...args){const result=current.apply(this,args);setTimeout(loadCustomerSpecialRequest,0);return result};
  wrapped.__customerSpecialRequestWrapped=true;wrapped.__base=current;window.openCustomerProfile=wrapped;try{openCustomerProfile=wrapped}catch(_){}
}
function start(){
  installStyles();ensureCustomerSection();wrapCustomerProfile();wrapRenderAlerts();scanSpecialRequests();
  if(!scanTimer)scanTimer=setInterval(()=>scanSpecialRequests(),60000);
  window.addEventListener('focus',()=>scanSpecialRequests());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scanSpecialRequests()});
  window.addEventListener('adwaa-subscription-updated',()=>setTimeout(()=>scanSpecialRequests(),0));
  document.addEventListener('click',event=>{if(event.target.closest('[onclick*="openCustomerProfile"],.customer-directory-row'))setTimeout(loadCustomerSpecialRequest,30)},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
