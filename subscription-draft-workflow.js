(()=>{
'use strict';
if(window.__adwaaSubscriptionDraftWorkflowInstalled)return;
window.__adwaaSubscriptionDraftWorkflowInstalled=true;

const HOLD_MS=86400000;
let savingOfficial=false;
const uuid=()=>crypto.randomUUID?.()||`sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const num=v=>Math.max(0,Number(v||0));
const money=v=>`${num(v).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const esc=s=>typeof escapeHtml==='function'?escapeHtml(String(s??'')):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const parse=s=>{const [y,m,d]=String(s||'').split('-').map(Number);return new Date(y,m-1,d)};
const greg=s=>new Intl.DateTimeFormat('ar-SA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(parse(s));
const hijri=s=>new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric'}).format(parse(s));

function drafts(){
 if(!window.db)return[];
 window.db.subscriptionDrafts=Array.isArray(window.db.subscriptionDrafts)?window.db.subscriptionDrafts:[];
 expire();return window.db.subscriptionDrafts;
}
function subscriptions(){
 if(!window.db)return[];
 window.db.subscriptions=Array.isArray(window.db.subscriptions)?window.db.subscriptions:[];
 return window.db.subscriptions;
}
function expire(){
 if(!window.db)return;
 for(const d of (window.db.subscriptionDrafts||[]))if(d.status==='holding'&&new Date(d.expiresAt).getTime()<=Date.now()){
  d.status='expired';d.expiredAt=d.expiredAt||new Date().toISOString();
 }
}
function heldDates(exclude=''){
 const set=new Set();
 for(const d of drafts())if(d.id!==exclude&&d.status==='holding'&&new Date(d.expiresAt).getTime()>Date.now())for(const x of d.dates||[])set.add(x);
 return set;
}
function selectedDates(){
 return[...document.querySelectorAll('#subscriptionCalendar .subscription-day.selected')].map(el=>String(el.getAttribute('onclick')||'').match(/'([^']+)'/)?.[1]||'').filter(Boolean).sort();
}
function formData(){
 const option=document.querySelector('#subCustomer option:checked');
 return{
  name:document.getElementById('subName')?.value?.trim()||option?.dataset.name||'',
  phone:document.getElementById('subPhone')?.value?.trim()||option?.dataset.phone||'',
  dates:selectedDates(),
  visits:Math.max(1,Number(document.getElementById('subVisits')?.value||1)),
  type:document.getElementById('subType')?.value||'custom',
  typeLabel:document.getElementById('subType')?.selectedOptions?.[0]?.textContent||'اشتراك دوري',
  total:num(document.getElementById('subTotal')?.value),
  paid:num(document.getElementById('subPaid')?.value),
  note:String(document.getElementById('subNote')?.value||'').trim()
 };
}
function bookingConflict(date){
 return(window.db?.bookings||[]).some(b=>{
  if(b.status==='ملغي')return false;
  const start=parse(b.date);if(Number.isNaN(start.getTime()))return false;
  const days=Math.max(1,Number(b.stayDays||1));
  for(let i=0;i<days;i++){
   const x=new Date(start);x.setDate(x.getDate()+i);
   const key=`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
   if(key===date)return true;
  }
  return false;
 });
}
function validate(data,excludeDraft=''){
 if(!data.name)return'اكتب اسم العميل.';
 if(!data.phone)return'اكتب رقم الجوال.';
 if(data.dates.length!==data.visits)return`اختر ${data.visits} يومًا بالضبط.`;
 if(data.paid>data.total)return'المبلغ المدفوع أكبر من قيمة الاشتراك.';
 const held=heldDates(excludeDraft);
 const conflict=data.dates.find(date=>held.has(date)||bookingConflict(date));
 if(conflict)return`اليوم ${conflict} غير متاح. اختر يومًا آخر.`;
 return'';
}
async function save(){
 if(typeof window.persist==='function')await window.persist();
 window.renderAll?.();window.renderCustomers?.();
 setTimeout(()=>{renderPanels();window.dispatchEvent(new Event('adwaa-subscription-updated'))},80);
}
function initialPayment(paid){
 return paid>0?[{id:uuid(),amount:paid,date:new Date().toISOString(),method:'غير محدد',note:'الدفعة المسجلة عند اعتماد الاشتراك'}]:[];
}
function createVisitBookings(sub){
 window.db.bookings=Array.isArray(window.db.bookings)?window.db.bookings:[];
 for(const date of sub.dates){
  let booking={
   id:uuid(),code:`AD-${String(window.db.seq||1).padStart(4,'0')}`,name:sub.name,phone:sub.phone,date,
   type:'يومي',stayDays:1,paid:0,total:0,status:'مؤكد',
   notes:`اشتراك دوري • ${sub.typeLabel}${sub.note?' • '+sub.note:''}`,
   recordType:'customer',subscriptionId:sub.id,subscriptionVisit:true,subscriptionPaymentManaged:true,subscriptionValue:sub.total,
   createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  if(typeof window.normalizeBookingCommission==='function')booking=window.normalizeBookingCommission(booking,window.db.settings);
  window.db.bookings.push(booking);window.db.seq=(window.db.seq||1)+1;
 }
}
function makeSubscription(data,draftId=null){
 const now=new Date().toISOString(),remaining=Math.max(0,data.total-data.paid);
 return{
  id:uuid(),name:data.name,phone:data.phone,type:data.type,typeLabel:data.typeLabel,visits:data.visits,dates:[...data.dates].sort(),
  total:data.total,paid:data.paid,remaining,paymentManaged:true,paymentStatus:remaining>0?'مدفوع جزئيًا':'مدفوع بالكامل',
  paymentHistory:initialPayment(data.paid),note:data.note,status:remaining>0?'partial':'paid',createdAt:now,updatedAt:now,draftId:draftId||null,
  portalTransferredDates:[]
 };
}
async function createOfficial(data,draftId=null){
 if(savingOfficial)return false;
 const error=validate(data,draftId||'');if(error){alert(error);return false}
 const remaining=Math.max(0,data.total-data.paid);
 const warning=remaining>0?`\n\n⚠️ يوجد متبقي ${money(remaining)} وسيبقى الاشتراك رسميًا.`:'';
 if(!confirm(`اعتماد الاشتراك رسميًا؟\n\nالعميل: ${data.name}\nالزيارات: ${data.dates.length}\nالإجمالي: ${money(data.total)}\nالمدفوع: ${money(data.paid)}\nالمتبقي: ${money(remaining)}${warning}`))return false;
 savingOfficial=true;
 try{
  const sub=makeSubscription(data,draftId);subscriptions().push(sub);createVisitBookings(sub);
  if(draftId){const d=drafts().find(x=>x.id===draftId);if(d){d.status='approved';d.subscriptionId=sub.id;d.paid=data.paid;d.approvedAt=new Date().toISOString();d.updatedAt=d.approvedAt}}
  await save();window.closeSubscriptionModal?.();
  alert(remaining>0?`✅ تم اعتماد الاشتراك رسميًا.\n⚠️ المتبقي: ${money(remaining)}`:'✅ تم اعتماد الاشتراك رسميًا ومكتمل السداد.');
  return true;
 }finally{savingOfficial=false}
}
async function approveFromForm(){return createOfficial(formData())}
async function saveDraft(){
 const data=formData(),error=validate(data);if(error){alert(error);return}
 const now=new Date();drafts().push({...data,id:uuid(),status:'holding',createdAt:now.toISOString(),updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+HOLD_MS).toISOString(),approvedAt:null,portalTransferredDates:[]});
 await save();window.closeSubscriptionModal?.();alert('⏳ تم حفظ الحجز المبدئي لمدة 24 ساعة. ستبقى المسودة محفوظة بعد انتهاء المهلة.');
}
async function approveDraft(id){
 const d=drafts().find(x=>x.id===id);if(!d||d.status==='approved')return;
 const value=prompt(`إجمالي الاشتراك ${money(d.total)}\nأدخل إجمالي المبلغ المستلم حتى الآن:`,String(d.paid||0));if(value===null)return;
 const paid=num(value);if(paid>d.total){alert('المبلغ المستلم أكبر من قيمة الاشتراك.');return}
 return createOfficial({...d,paid},id);
}
async function addPayment(subscriptionId){
 const sub=subscriptions().find(x=>x.id===subscriptionId);if(!sub)return;
 if(!sub.paymentManaged){alert('هذا اشتراك قديم. لم يتم تحويل سجله المالي للنظام الجديد حتى لا تتغير بياناته السابقة.');return}
 const due=Math.max(0,num(sub.total)-num(sub.paid));if(due<=0){alert('الاشتراك مكتمل السداد.');return}
 const value=prompt(`المتبقي الحالي ${money(due)}\nأدخل قيمة الدفعة الجديدة:`,'');if(value===null)return;
 const amount=num(value);if(amount<=0){alert('أدخل مبلغًا صحيحًا.');return}if(amount>due){alert(`الدفعة أكبر من المتبقي (${money(due)}).`);return}
 const method=prompt('طريقة الدفع (اختياري):','تحويل')??'تحويل';
 const note=prompt('ملاحظة على الدفعة (اختياري):','')??'';
 sub.paymentHistory=Array.isArray(sub.paymentHistory)?sub.paymentHistory:[];
 sub.paymentHistory.push({id:uuid(),amount,date:new Date().toISOString(),method,note});
 sub.paid=num(sub.paid)+amount;sub.remaining=Math.max(0,num(sub.total)-sub.paid);sub.paymentStatus=sub.remaining>0?'مدفوع جزئيًا':'مدفوع بالكامل';sub.status=sub.remaining>0?'partial':'paid';sub.updatedAt=new Date().toISOString();
 const d=drafts().find(x=>x.subscriptionId===sub.id);if(d){d.paid=sub.paid;d.updatedAt=sub.updatedAt}
 await save();alert(sub.remaining>0?`تم تسجيل الدفعة. المتبقي ${money(sub.remaining)}.`:'تم تسجيل الدفعة واكتمل سداد الاشتراك.');
}
async function renew(id){
 const d=drafts().find(x=>x.id===id);if(!d)return;
 const conflicts=d.dates.filter(x=>bookingConflict(x)||heldDates(id).has(x));if(conflicts.length){alert('تعذر إعادة الحجز لأن بعض الأيام لم تعد متاحة:\n'+conflicts.join('\n'));return}
 d.status='holding';d.expiresAt=new Date(Date.now()+HOLD_MS).toISOString();d.updatedAt=new Date().toISOString();await save();
}
async function remove(id){if(!confirm('حذف المسودة نهائيًا؟'))return;window.db.subscriptionDrafts=drafts().filter(x=>x.id!==id);await save()}
function remainingHold(d){
 if(d.status==='approved')return'معتمد';if(d.status==='expired')return'انتهى الحجز المؤقت';
 const ms=new Date(d.expiresAt).getTime()-Date.now();if(ms<=0)return'انتهى الحجز المؤقت';return`متبقي ${Math.floor(ms/3600000)} ساعة و${Math.floor(ms%3600000/60000)} دقيقة`;
}
function copyDates(id){
 const d=drafts().find(x=>x.id===id);if(!d)return;const text=d.dates.map(x=>`${greg(x)} — ${hijri(x)}`).join('\n');
 navigator.clipboard?.writeText(text).then(()=>alert('تم نسخ الأيام.')).catch(()=>prompt('انسخ الأيام:',text));
}
async function transferDates(entity){
 if(!window.supabaseClient){alert('الاتصال ببوابة العملاء غير متاح.');return}
 const sent=new Set(entity.portalTransferredDates||[]),pending=(entity.dates||[]).filter(x=>!sent.has(x));if(!pending.length){alert('جميع الأيام مرحّلة مسبقًا.');return}
 const preview=pending.map(x=>`${greg(x)} — ${hijri(x)}`).join('\n');if(!confirm(`ترحيل ${pending.length} يومًا إلى تقويم بوابة العملاء؟\n\n${preview}`))return;
 const table='customer_portal_unavailable_periods',existing=await window.supabaseClient.from(table).select('start_date,end_date');if(existing.error){console.error(existing.error);alert('تعذر فحص تقويم البوابة.');return}
 const covered=date=>(existing.data||[]).some(p=>p.start_date<=date&&p.end_date>=date),ok=[],failed=[];
 for(const date of pending){
  if(covered(date)){ok.push(date);continue}
  const result=await window.supabaseClient.from(table).insert({start_date:date,end_date:date,updated_by:window.currentUser?.id||null});
  if(result.error){console.error(result.error);failed.push(date)}else ok.push(date)
 }
 entity.portalTransferredDates=[...new Set([...(entity.portalTransferredDates||[]),...ok])];entity.portalTransferFailures=failed;entity.portalTransferredAt=new Date().toISOString();
 await save();if(typeof window.loadPortalUnavailablePeriods==='function')await window.loadPortalUnavailablePeriods();
 alert(failed.length?`تم ترحيل ${ok.length} يوم وتعذر ${failed.length}.`:'تم ترحيل جميع الأيام إلى تقويم بوابة العملاء.');
}
async function transferDraft(id){const d=drafts().find(x=>x.id===id);if(!d||d.status!=='approved'){alert('اعتمد الاشتراك أولًا.');return}return transferDates(d)}
async function transferSubscription(id){const s=subscriptions().find(x=>x.id===id);if(!s)return;return transferDates(s)}

function renderDraftPanel(){
 const root=document.getElementById('subscriptionDraftPanel');if(!root)return;
 const rows=drafts().slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 root.innerHTML=rows.length?rows.map(d=>`<article class="draft-card"><div class="draft-head"><div><h4>${esc(d.name)} — ${esc(d.typeLabel)}</h4><div class="meta">${esc(d.phone)} • ${d.dates.length} يوم • ${esc(remainingHold(d))}</div></div><span class="badge ${d.status==='approved'?'confirmed':d.status==='holding'?'pending':'cancelled'}">${d.status==='approved'?'معتمد':d.status==='holding'?'حجز مؤقت':'مسودة منتهية'}</span></div><details><summary>عرض الأيام (${d.dates.length})</summary><div class="draft-dates">${d.dates.map(x=>`<div class="draft-date"><b>${esc(greg(x))}</b><small>${esc(hijri(x))}</small></div>`).join('')}</div></details><div class="meta">الإجمالي ${money(d.total)} • المدفوع ${money(d.paid)} • المتبقي ${money(Math.max(0,num(d.total)-num(d.paid)))}</div><div class="actions">${d.status!=='approved'?`<button class="primary" onclick="approveSubscriptionDraft('${d.id}')">✅ اعتماد كاشتراك رسمي</button><button class="secondary" onclick="renewSubscriptionDraft('${d.id}')">⏳ إعادة حجز 24 ساعة</button>`:`<button class="primary" onclick="transferSubscriptionDraftToPortal('${d.id}')">ترحيل الأيام لبوابة العملاء</button>`}<button class="secondary" onclick="copySubscriptionDraftDates('${d.id}')">نسخ الأيام</button><button class="danger" onclick="deleteSubscriptionDraft('${d.id}')">حذف المسودة</button></div></article>`).join(''):'<div class="empty">لا توجد حجوزات مبدئية.</div>';
}
function renderOfficialPanel(){
 const root=document.getElementById('subscriptionOfficialPanel');if(!root)return;
 const rows=subscriptions().filter(s=>s?.paymentManaged).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 root.innerHTML=rows.length?rows.map(s=>{const paid=num(s.paid),due=Math.max(0,num(s.total)-paid);return`<article class="draft-card"><div class="draft-head"><div><h4>${esc(s.name)} — ${esc(s.typeLabel||'اشتراك دوري')}</h4><div class="meta">${esc(s.phone)} • ${s.dates?.length||0} زيارة</div></div><span class="badge ${due>0?'pending':'confirmed'}">${due>0?'مدفوع جزئيًا':'مكتمل السداد'}</span></div><div class="subscription-money-grid"><div><small>الإجمالي</small><b>${money(s.total)}</b></div><div><small>المدفوع</small><b>${money(paid)}</b></div><div class="${due>0?'due':''}"><small>المتبقي</small><b>${money(due)}</b></div></div>${due>0?`<div class="subscription-due-warning">⚠️ متبقي على العميل ${money(due)}</div>`:''}<details><summary>سجل الدفعات (${(s.paymentHistory||[]).length})</summary><div class="payment-mini-list">${(s.paymentHistory||[]).map(p=>`<div>${new Date(p.date).toLocaleDateString('ar-SA')} • ${money(p.amount)} • ${esc(p.method||'—')}</div>`).join('')||'<div class="meta">لا توجد دفعات مسجلة.</div>'}</div></details><div class="actions">${due>0?`<button class="primary" onclick="addSubscriptionPayment('${s.id}')">تسجيل دفعة</button>`:''}<button class="secondary" onclick="transferOfficialSubscriptionToPortal('${s.id}')">ترحيل الأيام للبوابة</button></div></article>`}).join(''):'<div class="empty">لا توجد اشتراكات رسمية بالنظام المالي الجديد.</div>';
}
function renderPanels(){renderDraftPanel();renderOfficialPanel()}
function install(){
 if(!document.getElementById('subscriptionDraftWorkflowStyles')){
  const s=document.createElement('style');s.id='subscriptionDraftWorkflowStyles';s.textContent=`.draft-panel{display:grid;gap:10px;padding:14px}.draft-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px}.draft-head{display:flex;justify-content:space-between;gap:10px}.draft-head h4{margin:0 0 5px}.draft-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0}.draft-date{border:1px solid var(--line);border-radius:11px;padding:8px}.draft-date small{display:block;color:var(--muted);margin-top:4px}.subscription-day.draft-held{background:#fff3d9!important;border-color:#d8a33e!important;color:#8b6500!important}.subscription-money-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}.subscription-money-grid>div{border:1px solid var(--line);border-radius:11px;padding:8px}.subscription-money-grid small,.subscription-money-grid b{display:block}.subscription-money-grid .due{border-color:#e1aa38;background:#fff8e8}.subscription-due-warning{background:#fff3d9;border:1px solid #e1aa38;border-radius:11px;padding:9px;margin:8px 0;font-weight:800}.payment-mini-list{display:grid;gap:5px;margin:8px 0;font-size:12px}@media(max-width:620px){.draft-dates{grid-template-columns:1fr}.subscription-money-grid{grid-template-columns:1fr 1fr 1fr;font-size:11px}}`;
  document.head.appendChild(s);
 }
 const view=document.getElementById('customersView');
 if(view&&!document.getElementById('subscriptionDraftPanel')){const section=document.createElement('div');section.className='section';section.innerHTML='<div class="section-head"><div><h3>الحجوزات المبدئية للاشتراكات</h3><div class="meta">حجز مؤقت 24 ساعة، وتبقى المسودة محفوظة بعد انتهاء المهلة.</div></div></div><div id="subscriptionDraftPanel" class="draft-panel"></div>';view.appendChild(section)}
 if(view&&!document.getElementById('subscriptionOfficialPanel')){const section=document.createElement('div');section.className='section';section.innerHTML='<div class="section-head"><div><h3>الاشتراكات الرسمية</h3><div class="meta">الإجمالي والمدفوع والمتبقي وسجل الدفعات في مكان واحد.</div></div></div><div id="subscriptionOfficialPanel" class="draft-panel"></div>';view.appendChild(section)}
 const actions=document.querySelector('#subscriptionModal .actions');
 if(actions&&!document.getElementById('saveSubscriptionDraft')){const btn=document.createElement('button');btn.id='saveSubscriptionDraft';btn.type='button';btn.className='secondary';btn.textContent='⏳ حفظ كحجز مبدئي 24 ساعة';btn.onclick=saveDraft;actions.insertBefore(btn,actions.firstChild)}
 const confirmBtn=document.getElementById('subConfirm');if(confirmBtn&&confirmBtn.dataset.safeSubscriptionOfficial!=='1'){confirmBtn.dataset.safeSubscriptionOfficial='1';confirmBtn.textContent='✅ اعتماد كاشتراك رسمي';confirmBtn.onclick=approveFromForm}
 markHeld();updatePaymentWarning();renderPanels();
}
function updatePaymentWarning(){
 const totalEl=document.getElementById('subTotal'),paidEl=document.getElementById('subPaid'),warningRoot=document.getElementById('subWarning');if(!totalEl||!paidEl||!warningRoot)return;
 const due=Math.max(0,num(totalEl.value)-num(paidEl.value)),old=warningRoot.querySelector('.subscription-payment-warning');old?.remove();
 if(due>0&&num(totalEl.value)>0){const div=document.createElement('div');div.className='subscription-warning subscription-payment-warning';div.textContent=`⚠️ عند الاعتماد سيبقى على العميل ${money(due)}`;warningRoot.appendChild(div)}
}
function markHeld(){
 const held=heldDates();
 for(const btn of document.querySelectorAll('#subscriptionCalendar .subscription-day')){
  const date=String(btn.getAttribute('onclick')||'').match(/'([^']+)'/)?.[1];
  if(date&&held.has(date)&&!btn.classList.contains('selected')){btn.classList.add('draft-held');btn.disabled=true;const labels=btn.querySelectorAll('small');if(labels.length)labels[labels.length-1].textContent='حجز مؤقت'}
 }
}

window.approveSubscriptionDraft=approveDraft;
window.renewSubscriptionDraft=renew;
window.deleteSubscriptionDraft=remove;
window.copySubscriptionDraftDates=copyDates;
window.transferSubscriptionDraftToPortal=transferDraft;
window.transferOfficialSubscriptionToPortal=transferSubscription;
window.addSubscriptionPayment=addPayment;

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
document.addEventListener('input',e=>{if(e.target?.id==='subTotal'||e.target?.id==='subPaid')setTimeout(updatePaymentWarning,0)});
setInterval(install,1500);
setInterval(()=>{expire();renderPanels()},60000);
})();
