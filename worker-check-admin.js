(()=>{
'use strict';
if(window.__adwaaWorkerCheckAdminInstalled)return;
window.__adwaaWorkerCheckAdminInstalled=true;

const TABLE='customer_portal_worker_checks';
const BUCKET='customer-portal-worker-checks';
const DEFAULT_PROPERTY_NAME='أضواء الشرق';
const DEFAULT_PROPERTY_TYPE='منتجع';
let portalClient=null;
let checks=[];
let checksByBooking=new Map();
let backendAvailable=false;
let realtimeChannel=null;
let refreshTimer=null;
let signedMediaCache=new Map();

const state=()=>window.db;
const bookings=()=>Array.isArray(state()?.bookings)?state().bookings:[];
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const isoTodayRiyadh=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=type=>parts.find(part=>part.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`};
const riyadhHour=()=>Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',hour:'2-digit',hour12:false}).format(new Date()))%24;
function definiteType(value){const type=String(value||DEFAULT_PROPERTY_TYPE).trim();return type.startsWith('ال')?type:`ال${type}`}
function propertyName(){return String(state()?.settings?.propertyName||DEFAULT_PROPERTY_NAME).trim()||DEFAULT_PROPERTY_NAME}
function propertyType(){return String(state()?.settings?.propertyType||DEFAULT_PROPERTY_TYPE).trim()||DEFAULT_PROPERTY_TYPE}
function propertyLabel(){const type=propertyType(),name=propertyName();return name.startsWith(type)?name:`${type} ${name}`}
function workerCheckTitle(){return `تشييك عامل ${definiteType(propertyType())}`}
function bookingExitDateValue(booking){try{return typeof window.bookingExitDate==='function'?window.bookingExitDate(booking):booking?.date||''}catch(_){return booking?.date||''}}
function latestCheck(bookingId){return checksByBooking.get(String(bookingId||''))||null}

function installNormalizeBridge(){
  try{
    const current=window.normalizeDB;
    if(typeof current!=='function'||current.__workerPropertyIdentityPreserved)return;
    const wrapped=function(value){
      const source=value&&typeof value==='object'?value:{};
      const normalized=current(source);
      normalized.settings=normalized.settings&&typeof normalized.settings==='object'?normalized.settings:{};
      normalized.settings.propertyName=String(source.settings?.propertyName||normalized.settings.propertyName||DEFAULT_PROPERTY_NAME).trim()||DEFAULT_PROPERTY_NAME;
      normalized.settings.propertyType=String(source.settings?.propertyType||normalized.settings.propertyType||DEFAULT_PROPERTY_TYPE).trim()||DEFAULT_PROPERTY_TYPE;
      return normalized;
    };
    wrapped.__workerPropertyIdentityPreserved=true;wrapped.__baseNormalizeDB=current;
    window.normalizeDB=wrapped;
    try{normalizeDB=wrapped}catch(_){}
  }catch(error){console.warn('تعذر تفعيل هوية المنشأة الديناميكية.',error)}
}
function ensureIdentityDefaults(){const db=state();if(!db)return;db.settings=db.settings&&typeof db.settings==='object'?db.settings:{};if(!db.settings.propertyName)db.settings.propertyName=DEFAULT_PROPERTY_NAME;if(!db.settings.propertyType)db.settings.propertyType=DEFAULT_PROPERTY_TYPE}
function ensureIdentitySettings(){
  const settings=document.getElementById('settings');if(!settings||document.getElementById('propertyIdentitySection'))return;
  const section=document.createElement('div');section.id='propertyIdentitySection';section.className='section';
  section.innerHTML=`<div class="section-head"><div><h3>هوية المنشأة</h3><div class="meta">تُستخدم في ${escapeHtml(workerCheckTitle())} وفي الميزات القابلة للبيع مستقبلًا.</div></div></div><div style="padding:18px"><div class="form-grid"><label>اسم المنشأة<input id="propertyIdentityName" maxlength="120" placeholder="مثال: أضواء الشرق"></label><label>نوع المنشأة<input id="propertyIdentityType" maxlength="60" list="propertyTypeOptions" placeholder="استراحة / شاليه / منتجع"><datalist id="propertyTypeOptions"><option value="استراحة"><option value="شاليه"><option value="منتجع"><option value="مخيم"><option value="مزرعة"><option value="قاعة"></datalist></label></div><div class="actions"><button class="primary" type="button" id="savePropertyIdentityButton">حفظ هوية المنشأة</button></div><div id="propertyIdentityPreview" class="notice" style="margin-top:12px"></div></div>`;
  settings.prepend(section);
  document.getElementById('savePropertyIdentityButton')?.addEventListener('click',savePropertyIdentity);
  fillIdentitySettings();
}
function fillIdentitySettings(){ensureIdentityDefaults();const name=document.getElementById('propertyIdentityName'),type=document.getElementById('propertyIdentityType'),preview=document.getElementById('propertyIdentityPreview');if(name)name.value=propertyName();if(type)type.value=propertyType();if(preview)preview.textContent=`مثال العنوان: ${workerCheckTitle()} — ${propertyLabel()}`}
async function savePropertyIdentity(){
  const name=String(document.getElementById('propertyIdentityName')?.value||'').trim(),type=String(document.getElementById('propertyIdentityType')?.value||'').trim();
  if(!name||!type){alert('اكتب اسم المنشأة ونوعها.');return}
  if(name.length>120||type.length>60){alert('اسم أو نوع المنشأة أطول من الحد المسموح.');return}
  ensureIdentityDefaults();state().settings.propertyName=name;state().settings.propertyType=type;
  try{if(typeof window.persist==='function')await window.persist();fillIdentitySettings();postProcessLegacyUI();renderWorkerAlerts()}catch(error){console.error(error);alert('تعذر حفظ هوية المنشأة.')}
}

function retireLegacyCleaningFunctions(){
  const noTask=()=>null;
  try{window.ensureCleaningTaskForBooking=noTask}catch(_){}
  try{window.ensureCleanerTask=noTask}catch(_){}
  window.createCleaningLink=(bookingId)=>window.shareWorkerCheck?.(bookingId);
  window.sendCleaningTaskToJameel=(bookingId)=>window.shareWorkerCheck?.(bookingId);
  window.createCleaningLinkFromModal=()=>{const id=document.getElementById('bId')?.value||'';return id?window.shareWorkerCheck?.(id):alert('افتح الحجز أولًا.');};
}
function bookingIdFromButton(button){const text=String(button.getAttribute('onclick')||'');const match=text.match(/(?:createCleaningLink|sendCleaningTaskToJameel)\('([^']+)'/);return match?.[1]||''}
function postProcessLegacyUI(){
  document.querySelectorAll('nav button').forEach(button=>{const text=button.textContent||'';if(button.dataset.view==='cleaning'||text.includes('بوابة جميل')||text.includes('التنظيف'))button.remove()});
  const cleaningView=document.getElementById('cleaning');if(cleaningView){cleaningView.hidden=true;cleaningView.classList.remove('active')}
  document.querySelectorAll('button[onclick*="createCleaningLink"],button[onclick*="sendCleaningTaskToJameel"]').forEach(button=>{
    const id=bookingIdFromButton(button),booking=bookings().find(row=>row.id===id);
    if(String(button.getAttribute('onclick')||'').includes('sendCleaningTaskToJameel')){button.hidden=true;return}
    button.textContent=`🔎 ${workerCheckTitle()}`;button.hidden=booking?.status!=='تم الخروج';
  });
  document.querySelectorAll('.action-alert').forEach(card=>{const text=card.textContent||'';if(text.includes('تنظيف')||text.includes('جميل'))card.remove()});
}

function ensureWorkerPanel(){
  const form=document.getElementById('bookingForm');if(!form)return null;
  let panel=document.getElementById('workerCheckBookingPanel');
  if(!panel){panel=document.createElement('section');panel.id='workerCheckBookingPanel';panel.className='send-center';panel.innerHTML='<h3>تشييك العامل</h3><div class="meta">صور وتسجيل صوتي فقط، مربوطان بهذا الحجز.</div><div id="workerCheckBookingBody" class="notice">جاري التحقق…</div>';form.appendChild(panel)}
  panel.querySelector('h3').textContent=workerCheckTitle();return panel;
}
function issueLabel(value){return({ok:'✅ كل شيء طبيعي',damage_furniture:'🪑 ضرر أثاث',damage_electrical:'💡 كهرباء',damage_water:'🚰 ماء / تسريب',damage_glass:'🪟 زجاج / كسر',damage_building:'🧱 ضرر بالمكان',extra_dirt:'🧽 أوساخ زائدة'})[value]||value}
async function signedMedia(row){
  if(!row||!['submitted','reviewed'].includes(row.status))return {photos:[],voice:''};
  const key=`${row.id}:${row.submitted_at||''}`;if(signedMediaCache.has(key))return signedMediaCache.get(key);
  const result={photos:[],voice:''};
  try{
    const paths=Array.isArray(row.photo_paths)?row.photo_paths:[];
    if(paths.length){const {data,error}=await portalClient.storage.from(BUCKET).createSignedUrls(paths,900);if(error)throw error;result.photos=(data||[]).map(item=>item.signedUrl).filter(Boolean)}
    if(row.voice_path){const {data,error}=await portalClient.storage.from(BUCKET).createSignedUrl(row.voice_path,900);if(error)throw error;result.voice=data?.signedUrl||''}
  }catch(error){console.warn('تعذر إنشاء روابط وسائط تشييك العامل.',error)}
  signedMediaCache.set(key,result);return result;
}
async function renderWorkerPanel(bookingId){
  const panel=ensureWorkerPanel(),body=document.getElementById('workerCheckBookingBody');if(!panel||!body)return;
  const booking=bookings().find(row=>row.id===bookingId);if(!booking){body.textContent='الحجز غير موجود.';return}
  if(!backendAvailable){body.innerHTML='ربط تشييك العامل غير جاهز في قاعدة البوابة بعد.';return}
  const row=latestCheck(bookingId);
  if(!row){
    body.innerHTML=booking.status==='تم الخروج'?`لم تتم مشاركة التشييك بعد.<div class="actions"><button class="primary" type="button" data-worker-share>مشاركة ${escapeHtml(workerCheckTitle())}</button></div>`:'يظهر رابط التشييك بعد تسجيل خروج العميل.';
    body.querySelector('[data-worker-share]')?.addEventListener('click',()=>shareWorkerCheck(bookingId));return;
  }
  if(row.status==='ready'){
    body.innerHTML=`${row.shared_at?'تمت مشاركة الرابط، وبانتظار إرسال العامل.':'الرابط جاهز ولم يتم تأكيد مشاركته بعد.'}<div class="actions"><button class="primary" type="button" data-worker-share>مشاركة الرابط من جديد</button></div>`;
    body.querySelector('[data-worker-share]')?.addEventListener('click',()=>shareWorkerCheck(bookingId));return;
  }
  const media=await signedMedia(row),issues=(row.issue_types||[]).map(issueLabel);
  body.innerHTML=`<b>${row.status==='reviewed'?'✅ تمت مراجعة التشييك':'🔔 وصل تشييك العامل'}</b><div class="meta" style="margin-top:7px">${issues.map(escapeHtml).join(' • ')||'بدون تصنيف'}</div>${media.photos.length?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px">${media.photos.map(url=>`<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="صورة تشييك العامل" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px"></a>`).join('')}</div>`:''}${media.voice?`<audio controls src="${media.voice}" style="width:100%;margin-top:10px"></audio>`:''}${row.status==='submitted'?'<div class="actions"><button class="primary" type="button" data-worker-reviewed>تمت المراجعة</button></div>':''}`;
  body.querySelector('[data-worker-reviewed]')?.addEventListener('click',()=>markWorkerCheckReviewed(row.id,bookingId));
}

function eligibleForMorningShare(booking){
  if(!booking||booking.recordType==='family'||booking.status!=='تم الخروج')return false;
  const exitDate=bookingExitDateValue(booking),today=isoTodayRiyadh();if(!exitDate||exitDate>today)return false;
  if(exitDate===today&&riyadhHour()<6)return false;
  return true;
}
function renderWorkerAlerts(){
  const root=document.getElementById('alertsList');if(!root)return;
  root.querySelectorAll('.worker-check-alert').forEach(node=>node.remove());postProcessLegacyUI();if(!backendAvailable)return;
  const alerts=[];
  for(const booking of bookings()){
    if(!eligibleForMorningShare(booking))continue;
    const row=latestCheck(booking.id);
    if(row?.status==='reviewed')continue;
    if(row?.status==='submitted')alerts.push({booking,row,kind:'submitted'});
    else if(!row||!row.shared_at)alerts.push({booking,row,kind:'share'});
  }
  for(const alert of alerts.slice(0,6).reverse()){
    const article=document.createElement('article');article.className='action-alert worker-check-alert';
    if(alert.kind==='submitted')article.innerHTML=`<span class="action-alert-icon">🔎</span><div><h3>وصل ${escapeHtml(workerCheckTitle())}</h3><p>الحجز #${escapeHtml(alert.booking.code||'')} — الصور والتسجيل جاهزة للمراجعة.</p></div><button type="button">فتح التقرير</button>`;
    else article.innerHTML=`<span class="action-alert-icon">📤</span><div><h3>مشاركة ${escapeHtml(workerCheckTitle())}</h3><p>خرج العميل من الحجز #${escapeHtml(alert.booking.code||'')}. أرسل رابط التشييك للعامل.</p></div><button type="button">مشاركة الرابط</button>`;
    article.querySelector('button').addEventListener('click',()=>alert.kind==='submitted'?openWorkerCheckReport(alert.booking.id):shareWorkerCheck(alert.booking.id));root.prepend(article);
  }
}
function showToast(message){
  let toast=document.getElementById('workerCheckToast');if(!toast){toast=document.createElement('div');toast.id='workerCheckToast';toast.style.cssText='position:fixed;top:max(16px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:9999;background:#17332d;color:#fff;padding:12px 16px;border-radius:16px;box-shadow:0 8px 25px #0003;font-weight:800;max-width:90vw;text-align:center';document.body.appendChild(toast)}toast.textContent=message;toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{toast.hidden=true},4500)
}

async function ensurePortalAdmin(){
  portalClient=window.portalAdminClient||portalClient;if(!portalClient)return false;
  if(window.portalAdminAuthState?.ready===true)return true;
  try{return await window.verifyPortalAdminSession?.()===true}catch(_){return false}
}
async function refreshChecks(){
  if(!await ensurePortalAdmin()){backendAvailable=false;renderWorkerAlerts();return false}
  try{
    const {data,error}=await portalClient.from(TABLE).select('id,booking_id,booking_code,booking_date,property_name,property_type,status,issue_types,photo_paths,voice_path,shared_at,submitted_at,reviewed_at,created_at').order('created_at',{ascending:false}).limit(100);
    if(error)throw error;checks=Array.isArray(data)?data:[];checksByBooking=new Map();for(const row of checks){if(!checksByBooking.has(String(row.booking_id||'')))checksByBooking.set(String(row.booking_id||''),row)}backendAvailable=true;renderWorkerAlerts();const current=document.getElementById('bId')?.value;if(current)renderWorkerPanel(current);return true;
  }catch(error){console.warn('تعذر تحميل تشييك العامل.',error);backendAvailable=false;renderWorkerAlerts();return false}
}
function shareModal(){
  let modal=document.getElementById('workerCheckShareModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='workerCheckShareModal';modal.className='modal';modal.innerHTML='<div class="sheet" style="max-width:560px;margin:auto"><div class="sheet-head"><h2 id="workerShareTitle">مشاركة تشييك العامل</h2><button class="close" type="button" data-close-worker-share>×</button></div><div class="notice">الرابط خاص بهذا الحجز. أرسله للعامل فقط.</div><input id="workerShareUrl" readonly dir="ltr"><div class="actions"><button class="primary" type="button" id="workerNativeShare">مشاركة</button><button class="secondary" type="button" id="workerCopyShare">نسخ الرابط</button></div></div>';document.body.appendChild(modal);modal.querySelector('[data-close-worker-share]').addEventListener('click',()=>modal.classList.remove('open'));return modal
}
async function markShared(checkId){if(!portalClient||!checkId)return;const {error}=await portalClient.from(TABLE).update({shared_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',checkId);if(error)console.warn('تعذر تسجيل مشاركة رابط العامل.',error);await refreshChecks()}
async function openShareDialog(url,checkId,booking){
  const modal=shareModal();document.getElementById('workerShareTitle').textContent=`مشاركة ${workerCheckTitle()}`;document.getElementById('workerShareUrl').value=url;modal.classList.add('open');
  document.getElementById('workerNativeShare').onclick=async()=>{try{if(navigator.share){await navigator.share({title:workerCheckTitle(),text:`${workerCheckTitle()} للحجز #${booking.code||''}`,url});await markShared(checkId);modal.classList.remove('open')}else{await navigator.clipboard.writeText(url);await markShared(checkId);showToast('تم نسخ الرابط. أرسله للعامل.')}}catch(error){if(error?.name!=='AbortError')console.warn(error)}};
  document.getElementById('workerCopyShare').onclick=async()=>{try{await navigator.clipboard.writeText(url);await markShared(checkId);showToast('تم نسخ رابط التشييك.');modal.classList.remove('open')}catch(_){prompt('انسخ رابط التشييك:',url)}};
}
async function shareWorkerCheck(bookingId){
  const booking=bookings().find(row=>row.id===bookingId);if(!booking){alert('الحجز غير موجود.');return}
  if(booking.status!=='تم الخروج'){alert('يتم إرسال تشييك العامل بعد تسجيل خروج العميل.');return}
  if(!await ensurePortalAdmin()){alert('جلسة إدارة بوابة العملاء غير جاهزة. حدّث الصفحة ثم حاول مرة أخرى.');return}
  try{
    const {data,error}=await portalClient.rpc('create_customer_portal_worker_check',{p_booking_id:booking.id,p_booking_code:String(booking.code||''),p_booking_date:booking.date||null,p_property_name:propertyName(),p_property_type:propertyType()});
    if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(!row?.check_id||!row?.access_token)throw new Error('لم يتم إنشاء رابط صالح');
    const url=new URL('worker-check.html',location.href);url.searchParams.set('token',row.access_token);await openShareDialog(url.href,row.check_id,booking);
  }catch(error){console.error(error);const submitted=String(error?.message||'').includes('already submitted');if(submitted){await refreshChecks();openWorkerCheckReport(bookingId);return}alert('تعذر إنشاء رابط تشييك العامل. تأكد من تجهيز قاعدة بوابة العملاء.')}
}
async function markWorkerCheckReviewed(checkId,bookingId){
  if(!await ensurePortalAdmin())return;const {error}=await portalClient.from(TABLE).update({status:'reviewed',reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',checkId).eq('status','submitted');if(error){alert('تعذر اعتماد مراجعة التشييك.');return}await refreshChecks();renderWorkerPanel(bookingId)
}
function openWorkerCheckReport(bookingId){
  if(typeof window.openBooking==='function')window.openBooking(bookingId);setTimeout(()=>{renderWorkerPanel(bookingId);document.getElementById('workerCheckBookingPanel')?.scrollIntoView({behavior:'smooth',block:'center'})},180)
}

function patchOpenBooking(){
  const original=window.openBooking;if(typeof original!=='function'||original.__workerCheckWrapped)return;
  const wrapped=function(...args){const result=original.apply(this,args),bookingId=args[0]||'';if(bookingId)setTimeout(()=>renderWorkerPanel(bookingId),80);return result};wrapped.__workerCheckWrapped=true;wrapped.__baseOpenBooking=original;window.openBooking=wrapped;
}
function patchRenderers(){
  for(const name of ['renderDashboard','renderBookings','renderAll']){
    const original=window[name];if(typeof original!=='function'||original.__workerCheckWrapped)continue;
    const wrapped=function(...args){const result=original.apply(this,args);queueMicrotask(()=>{postProcessLegacyUI();renderWorkerAlerts()});return result};wrapped.__workerCheckWrapped=true;wrapped.__baseWorkerCheck=original;window[name]=wrapped;
  }
}
function subscribeRealtime(){
  if(!portalClient||realtimeChannel)return;
  try{realtimeChannel=portalClient.channel('adwaa-worker-checks').on('postgres_changes',{event:'UPDATE',schema:'public',table:TABLE},payload=>{const next=payload.new||{};if(next.status==='submitted')showToast(`🔔 وصل ${workerCheckTitle()} للحجز #${next.booking_code||''}`);signedMediaCache.clear();refreshChecks()}).subscribe()}catch(error){console.warn('تعذر تشغيل تنبيه تشييك العامل الفوري.',error)}
}
function startRefreshLoop(){if(refreshTimer)return;refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshChecks()},60000);window.addEventListener('focus',refreshChecks)}
function observeLegacyUI(){const observer=new MutationObserver(()=>{postProcessLegacyUI();renderWorkerAlerts()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),15000)}
async function initializePortal(){portalClient=window.portalAdminClient||null;if(!portalClient)return false;const ok=await refreshChecks();if(ok){subscribeRealtime();startRefreshLoop()}return ok}
function init(){installNormalizeBridge();ensureIdentityDefaults();ensureIdentitySettings();retireLegacyCleaningFunctions();patchOpenBooking();patchRenderers();postProcessLegacyUI();observeLegacyUI();let attempts=0;const timer=setInterval(async()=>{attempts+=1;if(await initializePortal()||attempts>=40)clearInterval(timer)},350)}

window.shareWorkerCheck=shareWorkerCheck;
window.openWorkerCheckReport=openWorkerCheckReport;
window.savePropertyIdentity=savePropertyIdentity;
window.addEventListener('adwaa-portal-admin-ready',()=>{portalClient=window.portalAdminClient||portalClient;refreshChecks().then(ok=>{if(ok){subscribeRealtime();startRefreshLoop()}})});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
