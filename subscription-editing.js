(()=>{
'use strict';
if(window.__adwaaSubscriptionEditingInstalled)return;
window.__adwaaSubscriptionEditingInstalled=true;

const HOLD_MS=86400000;
const state={kind:null,id:null,hydrating:false};
const num=v=>Math.max(0,Number(v||0));
const clone=v=>{try{return structuredClone(v)}catch(_){return JSON.parse(JSON.stringify(v))}};
const uuid=()=>crypto.randomUUID?.()||`sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const [y,m,d]=String(s||'').split('-').map(Number);return new Date(y,m-1,d)};
const money=v=>`${num(v).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;

function data(){return window.db||null}
function subscriptions(){const d=data();if(!d)return[];d.subscriptions=Array.isArray(d.subscriptions)?d.subscriptions:[];return d.subscriptions}
function drafts(){const d=data();if(!d)return[];d.subscriptionDrafts=Array.isArray(d.subscriptionDrafts)?d.subscriptionDrafts:[];return d.subscriptionDrafts}
function bookingRows(){const d=data();if(!d)return[];d.bookings=Array.isArray(d.bookings)?d.bookings:[];return d.bookings}
function draftById(id){return drafts().find(x=>x.id===id)||null}
function subscriptionById(id){return subscriptions().find(x=>x.id===id)||null}

function selectedDatesFromSummary(){
 const root=document.getElementById('selectedDays');if(!root)return[];
 return[...root.querySelectorAll('.selected-chip button')]
  .map(el=>String(el.getAttribute('onclick')||'').match(/'(\d{4}-\d{2}-\d{2})'/)?.[1])
  .filter(Boolean).sort();
}
function formData(){
 const option=document.querySelector('#subCustomer option:checked');
 return{
  name:String(document.getElementById('subName')?.value||option?.dataset.name||'').trim(),
  phone:String(document.getElementById('subPhone')?.value||option?.dataset.phone||'').trim(),
  dates:selectedDatesFromSummary(),
  visits:Math.max(1,Number(document.getElementById('subVisits')?.value||1)),
  type:document.getElementById('subType')?.value||'custom',
  typeLabel:document.getElementById('subType')?.selectedOptions?.[0]?.textContent||'اشتراك دوري',
  total:num(document.getElementById('subTotal')?.value),
  paid:num(document.getElementById('subPaid')?.value),
  note:String(document.getElementById('subNote')?.value||'').trim()
 };
}
function bookingOccupiesDate(b,date){
 if(!b||b.status==='ملغي')return false;
 const start=parse(b.date);if(Number.isNaN(start.getTime()))return false;
 const days=Math.max(1,Number(b.stayDays||1));
 for(let i=0;i<days;i++){const x=new Date(start);x.setDate(x.getDate()+i);if(dateKey(x)===date)return true}
 return false;
}
function validateEdit(row,{excludeDraftId='',excludeSubscriptionId=''}={}){
 if(!row.name)return'اكتب اسم العميل.';
 if(!row.phone)return'اكتب رقم الجوال.';
 if(row.dates.length!==row.visits)return`اختر ${row.visits} يومًا بالضبط.`;
 if(row.paid>row.total)return'المبلغ المدفوع أكبر من قيمة الاشتراك.';
 const now=Date.now();
 for(const d of drafts()){
  if(d.id===excludeDraftId||d.status!=='holding'||new Date(d.expiresAt||0).getTime()<=now)continue;
  const conflict=row.dates.find(x=>(d.dates||[]).includes(x));
  if(conflict)return`اليوم ${conflict} محجوز مؤقتًا باسم ${d.name||'عميل آخر'}.`;
 }
 for(const b of bookingRows()){
  if(excludeSubscriptionId&&b.subscriptionId===excludeSubscriptionId)continue;
  const conflict=row.dates.find(x=>bookingOccupiesDate(b,x));
  if(conflict)return`اليوم ${conflict} محجوز باسم ${b.name||'عميل آخر'}.`;
 }
 return'';
}
function snapshot(){const d=data();return d?{subscriptions:clone(d.subscriptions||[]),drafts:clone(d.subscriptionDrafts||[]),bookings:clone(d.bookings||[]),seq:d.seq}:null}
function rollback(s){const d=data();if(!d||!s)return;d.subscriptions=s.subscriptions;d.subscriptionDrafts=s.drafts;d.bookings=s.bookings;d.seq=s.seq;window.renderAll?.();window.renderCustomers?.()}
async function persistAndRender(){if(typeof window.persist==='function')await window.persist();window.renderAll?.();window.renderCustomers?.();window.dispatchEvent(new Event('adwaa-subscription-updated'))}

function createVisitBooking(sub,date){
 const d=data();let b={
  id:uuid(),code:`AD-${String(d.seq||1).padStart(4,'0')}`,name:sub.name,phone:sub.phone,date,type:'يومي',stayDays:1,paid:0,total:0,status:'مؤكد',
  notes:`اشتراك دوري • ${sub.typeLabel}${sub.note?' • '+sub.note:''}`,recordType:'customer',subscriptionId:sub.id,subscriptionVisit:true,subscriptionPaymentManaged:true,subscriptionValue:sub.total,
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
 };
 if(typeof window.normalizeBookingCommission==='function')b=window.normalizeBookingCommission(b,d.settings);
 d.seq=(d.seq||1)+1;return b;
}
function reconcileVisitBookings(sub,newDates){
 const d=data(),old=d.bookings.filter(b=>b.subscriptionId===sub.id&&b.subscriptionVisit),other=d.bookings.filter(b=>!(b.subscriptionId===sub.id&&b.subscriptionVisit));
 const byDate=new Map(old.map(b=>[b.date,b])),next=[];
 for(const date of newDates){
  const existing=byDate.get(date);
  if(existing){existing.name=sub.name;existing.phone=sub.phone;existing.date=date;existing.total=0;existing.paid=0;existing.subscriptionValue=sub.total;existing.notes=`اشتراك دوري • ${sub.typeLabel}${sub.note?' • '+sub.note:''}`;existing.updatedAt=new Date().toISOString();next.push(existing)}
  else next.push(createVisitBooking(sub,date));
 }
 d.bookings=[...other,...next];
}

function setEditBanner(entity){
 const modal=document.getElementById('subscriptionModal');if(!modal)return;
 let banner=document.getElementById('subscriptionEditBanner');
 if(!banner){banner=document.createElement('div');banner.id='subscriptionEditBanner';banner.className='subscription-edit-banner';const form=modal.querySelector('.subscription-form');form?.parentElement?.insertBefore(banner,form)}
 banner.innerHTML=`<b>✏️ وضع تعديل الاشتراك</b><span>${state.kind==='draft'?'حجز مبدئي — يمكنك حفظ التعديل أو اعتماده رسميًا':'اشتراك رسمي — عدّل البيانات ثم احفظ'}</span>`;
 const paid=document.getElementById('subPaid');if(paid){paid.disabled=state.kind==='official';paid.title=state.kind==='official'?'المدفوع الرسمي يُعدّل من سجل الدفعات':'يمكن تعديل المدفوع قبل الاعتماد الرسمي'}
 const official=document.getElementById('subConfirm');if(official)official.textContent=state.kind==='official'?'💾 حفظ تعديل الاشتراك الرسمي':'✅ حفظ التعديل واعتماد رسمي';
 const draft=document.getElementById('saveSubscriptionDraft');if(draft){draft.style.display='';draft.textContent=state.kind==='official'?'الاشتراك الرسمي لا يتحول لمؤقت':'💾 حفظ تعديل الحجز المبدئي';draft.disabled=state.kind==='official'}
}
function hydrateEditor(entity){
 if(state.hydrating)return;state.hydrating=true;
 try{
  const customer=document.getElementById('subCustomer');if(!customer)return false;
  let option=[...customer.options].find(o=>String(o.dataset.phone||'')===String(entity.phone||''));
  if(!option){option=document.createElement('option');option.value=`edit:${entity.id}`;option.dataset.name=entity.name||'';option.dataset.phone=entity.phone||'';option.textContent=`${entity.name||'عميل'} — ${entity.phone||''}`;customer.prepend(option)}
  customer.value=option.value;option.selected=true;customer.dispatchEvent(new Event('input',{bubbles:true}));
  const type=document.getElementById('subType');if(type&&[...type.options].some(o=>o.value===entity.type))type.value=entity.type;
  const visits=document.getElementById('subVisits');if(visits)visits.value=String(entity.visits||entity.dates?.length||1);
  const total=document.getElementById('subTotal');if(total)total.value=String(num(entity.total));
  const paid=document.getElementById('subPaid');if(paid)paid.value=String(num(entity.paid));
  const note=document.getElementById('subNote');if(note)note.value=entity.note||'';
  for(const date of entity.dates||[]){try{window.toggleSubscriptionDate?.(date)}catch(_){}}
  setEditBanner(entity);
  return true;
 }finally{state.hydrating=false}
}
function openEditor(kind,id){
 const entity=kind==='draft'?draftById(id):subscriptionById(id);if(!entity){alert('تعذر العثور على الاشتراك.');return}
 if(typeof window.openSubscriptionModal!=='function'){alert('تعذر فتح شاشة تعديل الاشتراك الآن. حدّث الصفحة وحاول مرة أخرى.');return}
 state.kind=kind;state.id=id;
 window.openSubscriptionModal();
 let tries=0;const timer=setInterval(()=>{tries++;if(hydrateEditor(entity)||tries>20)clearInterval(timer)},80);
}
function clearEdit(){state.kind=null;state.id=null;const banner=document.getElementById('subscriptionEditBanner');banner?.remove();const paid=document.getElementById('subPaid');if(paid)paid.disabled=false;const draft=document.getElementById('saveSubscriptionDraft');if(draft){draft.disabled=false;draft.style.display=''}}
function closeEditor(){window.closeSubscriptionModal?.();clearEdit()}

async function saveDraftEdit({close=true,silent=false}={}){
 const d=draftById(state.id);if(!d){alert('الحجز المبدئي غير موجود.');return false}
 const row=formData(),error=validateEdit(row,{excludeDraftId:d.id});if(error){alert(error);return false}
 const snap=snapshot();
 try{
  Object.assign(d,row,{status:'holding',expiresAt:new Date(Date.now()+HOLD_MS).toISOString(),updatedAt:new Date().toISOString()});
  await persistAndRender();
  if(close)closeEditor();
  if(!silent)alert('✅ تم حفظ تعديل الحجز المبدئي وتجديد المهلة لمدة 24 ساعة.');
  return true;
 }catch(error){console.error('تعذر تعديل الحجز المبدئي',error);rollback(snap);alert('تعذر حفظ التعديل، وتمت إعادة البيانات كما كانت.');return false}
}
async function convertDraftToOfficial(){
 const id=state.id;if(!await saveDraftEdit({close:false,silent:true}))return false;
 clearEdit();
 if(typeof window.approveSubscriptionDraft==='function')return window.approveSubscriptionDraft(id);
 alert('تعذر فتح الاعتماد الرسمي.');return false;
}
async function saveOfficialEdit(){
 const sub=subscriptionById(state.id);if(!sub){alert('الاشتراك الرسمي غير موجود.');return false}
 const row=formData();row.paid=num(sub.paid);
 const error=validateEdit(row,{excludeSubscriptionId:sub.id});if(error){alert(error);return false}
 if(row.total<row.paid){alert(`الإجمالي الجديد لا يمكن أن يكون أقل من المدفوع (${money(row.paid)}).`);return false}
 if(!confirm(`حفظ تعديلات اشتراك ${sub.name||row.name}؟\n\nالزيارات: ${row.dates.length}\nالإجمالي: ${money(row.total)}\nالمدفوع يبقى: ${money(row.paid)}\nالمتبقي الجديد: ${money(Math.max(0,row.total-row.paid))}`))return false;
 const snap=snapshot();
 try{
  Object.assign(sub,{name:row.name,phone:row.phone,type:row.type,typeLabel:row.typeLabel,visits:row.visits,dates:[...row.dates].sort(),total:row.total,note:row.note,remaining:Math.max(0,row.total-row.paid),paymentStatus:row.total-row.paid>0?'مدفوع جزئيًا':'مدفوع بالكامل',status:row.total-row.paid>0?'partial':'paid',updatedAt:new Date().toISOString()});
  reconcileVisitBookings(sub,sub.dates);
  const linked=drafts().find(x=>x.id===sub.draftId||x.subscriptionId===sub.id);if(linked)Object.assign(linked,{name:sub.name,phone:sub.phone,type:sub.type,typeLabel:sub.typeLabel,visits:sub.visits,dates:[...sub.dates],total:sub.total,paid:sub.paid,note:sub.note,updatedAt:sub.updatedAt});
  await persistAndRender();closeEditor();alert('✅ تم حفظ تعديل الاشتراك وتحديث أيامه المرتبطة.');return true;
 }catch(error){console.error('تعذر تعديل الاشتراك الرسمي',error);rollback(snap);alert('تعذر حفظ التعديل، وتمت إعادة الاشتراك والحجوزات كما كانت.');return false}
}

function addEditButtons(){
 const draftPanel=document.getElementById('subscriptionDraftPanel');
 draftPanel?.querySelectorAll('.draft-card').forEach(card=>{
  const any=[...card.querySelectorAll('button[onclick]')].map(b=>b.getAttribute('onclick')||'').join(' ');
  const id=any.match(/(?:approveSubscriptionDraft|renewSubscriptionDraft|deleteSubscriptionDraft|transferSubscriptionDraftToPortal)\('([^']+)'\)/)?.[1];if(!id)return;
  const actions=card.querySelector('.actions');if(!actions||actions.querySelector('[data-edit-subscription]'))return;
  const d=draftById(id);if(!d)return;const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.dataset.editSubscription='1';
  if(d.status==='approved'&&d.subscriptionId){btn.textContent='✏️ تعديل الاشتراك';btn.onclick=()=>openEditor('official',d.subscriptionId)}else{btn.textContent='✏️ تعديل';btn.onclick=()=>openEditor('draft',id)}
  actions.prepend(btn);
 });
 const officialPanel=document.getElementById('subscriptionOfficialPanel');
 officialPanel?.querySelectorAll('.draft-card').forEach(card=>{
  const any=[...card.querySelectorAll('button[onclick]')].map(b=>b.getAttribute('onclick')||'').join(' ');
  const id=any.match(/(?:addSubscriptionPayment|transferOfficialSubscriptionToPortal)\('([^']+)'\)/)?.[1];if(!id)return;
  const actions=card.querySelector('.actions');if(!actions||actions.querySelector('[data-edit-subscription]'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.dataset.editSubscription='1';btn.textContent='✏️ تعديل الاشتراك';btn.onclick=()=>openEditor('official',id);actions.prepend(btn);
 });
}

// أثناء وضع التعديل، نعترض زري الحفظ قبل مسارات الإنشاء الجديدة/القديمة حتى لا تتكوّن نسخة إضافية.
document.addEventListener('click',event=>{
 if(!state.kind)return;
 const btn=event.target?.closest?.('#subConfirm,#saveSubscriptionDraft');if(!btn)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(state.kind==='official'){
  if(btn.id==='saveSubscriptionDraft'){alert('الاشتراك الرسمي لا يتحول إلى حجز مؤقت. عدّل البيانات ثم اضغط حفظ تعديل الاشتراك الرسمي.');return}
  saveOfficialEdit();return;
 }
 if(btn.id==='saveSubscriptionDraft')saveDraftEdit();else convertDraftToOfficial();
},true);

document.addEventListener('click',event=>{
 if(!state.kind)return;
 if(event.target?.closest?.('#subscriptionModal .close')||event.target?.closest?.('#subscriptionModal [onclick*="closeSubscriptionModal"]'))setTimeout(clearEdit,0);
},true);

function styles(){if(document.getElementById('subscriptionEditingStyles'))return;const s=document.createElement('style');s.id='subscriptionEditingStyles';s.textContent=`.subscription-edit-banner{margin:0 0 12px;padding:11px 12px;border:1px solid #cfc8ff;border-radius:13px;background:#f4f1ff;color:#4035a8}.subscription-edit-banner b,.subscription-edit-banner span{display:block}.subscription-edit-banner span{font-size:12px;margin-top:4px;color:#675cae}`;document.head.appendChild(s)}
function init(){styles();addEditButtons();const observer=new MutationObserver(()=>addEditButtons());observer.observe(document.body,{childList:true,subtree:true});setInterval(addEditButtons,2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

window.editSubscriptionDraft=id=>openEditor('draft',id);
window.editOfficialSubscription=id=>openEditor('official',id);
})();
