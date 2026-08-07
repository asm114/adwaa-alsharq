(()=>{
'use strict';
if(window.__adwaaSubscriptionProfessionalFlowInstalled)return;
window.__adwaaSubscriptionProfessionalFlowInstalled=true;

const HOLD_MS=86400000;
const uuid=()=>crypto.randomUUID?.()||`sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const num=v=>Math.max(0,Number(v||0));
const money=v=>`${num(v).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const esc=s=>typeof escapeHtml==='function'?escapeHtml(String(s??'')):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=s=>{const [y,m,d]=String(s||'').split('-').map(Number);return new Date(y,m-1,d)};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function drafts(){
 if(!window.db)return[];
 window.db.subscriptionDrafts=Array.isArray(window.db.subscriptionDrafts)?window.db.subscriptionDrafts:[];
 for(const d of window.db.subscriptionDrafts){if(d.status==='holding'&&new Date(d.expiresAt).getTime()<=Date.now()){d.status='expired';d.expiredAt=d.expiredAt||new Date().toISOString()}}
 return window.db.subscriptionDrafts;
}
function subscriptions(){if(!window.db)return[];window.db.subscriptions=Array.isArray(window.db.subscriptions)?window.db.subscriptions:[];return window.db.subscriptions}
function selectedDates(){return[...document.querySelectorAll('#subscriptionCalendar .subscription-day.selected')].map(el=>String(el.getAttribute('onclick')||'').match(/'([^']+)'/)?.[1]||'').filter(Boolean).sort()}
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
function heldDates(exclude=''){
 const map=new Map();
 for(const d of drafts())if(d.id!==exclude&&d.status==='holding'&&new Date(d.expiresAt).getTime()>Date.now())for(const date of d.dates||[])map.set(date,d);
 return map;
}
function bookingOn(date){
 return(window.db?.bookings||[]).find(b=>{
  if(b.status==='ملغي')return false;
  const start=parse(b.date),days=Math.max(1,Number(b.stayDays||1));
  for(let i=0;i<days;i++){const x=new Date(start);x.setDate(x.getDate()+i);if(iso(x)===date)return true}
  return false;
 });
}
function validate(data,excludeDraft=''){
 if(!data.name)return'اكتب اسم العميل.';
 if(!data.phone)return'اكتب رقم الجوال.';
 if(data.dates.length!==data.visits)return`اختر ${data.visits} يومًا بالضبط.`;
 if(data.paid>data.total)return'المبلغ المدفوع أكبر من قيمة الاشتراك.';
 const held=heldDates(excludeDraft);
 const conflict=data.dates.find(date=>held.has(date)||bookingOn(date));
 if(conflict){const h=held.get(conflict),b=bookingOn(conflict);return`اليوم ${conflict} غير متاح${h?` — حجز مؤقت باسم ${h.name}`:b?` — محجوز باسم ${b.name||'عميل'}`:''}.`}
 return'';
}
async function saveAll(){if(typeof window.persist==='function')await window.persist();window.renderAll?.();window.renderCustomers?.();setTimeout(decorateCalendars,50)}
function initialPayment(data){return data.paid>0?[{id:uuid(),amount:data.paid,date:new Date().toISOString(),method:'غير محدد',note:'الدفعة المسجلة عند اعتماد الاشتراك'}]:[]}
function createVisitBookings(sub){
 window.db.bookings=Array.isArray(window.db.bookings)?window.db.bookings:[];
 for(const date of sub.dates){
  let b={id:uuid(),code:`AD-${String(window.db.seq||1).padStart(4,'0')}`,name:sub.name,phone:sub.phone,date,type:'يومي',stayDays:1,paid:0,total:0,status:'مؤكد',notes:`اشتراك دوري • ${sub.typeLabel}${sub.note?' • '+sub.note:''}`,recordType:'customer',subscriptionId:sub.id,subscriptionVisit:true,subscriptionPaymentManaged:true,subscriptionValue:sub.total,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(typeof window.normalizeBookingCommission==='function')b=window.normalizeBookingCommission(b,window.db.settings);
  window.db.bookings.push(b);window.db.seq=(window.db.seq||1)+1;
 }
}
async function createOfficial(data,draftId=null){
 const error=validate(data,draftId||'');if(error){alert(error);return false}
 const remaining=Math.max(0,data.total-data.paid);
 const warning=remaining>0?`\n\n⚠️ يوجد متبقي ${money(remaining)} وسيبقى الاشتراك رسميًا ومدفوعًا جزئيًا.`:'';
 if(!confirm(`اعتماد الاشتراك رسميًا؟\n\nالعميل: ${data.name}\nعدد الزيارات: ${data.dates.length}\nالإجمالي: ${money(data.total)}\nالمدفوع: ${money(data.paid)}\nالمتبقي: ${money(remaining)}${warning}`))return false;
 const now=new Date().toISOString();
 const sub={id:uuid(),name:data.name,phone:data.phone,type:data.type,typeLabel:data.typeLabel,visits:data.visits,dates:[...data.dates].sort(),total:data.total,paid:data.paid,remaining,status:remaining>0?'partial':'paid',paymentStatus:remaining>0?'مدفوع جزئيًا':'مدفوع بالكامل',paymentHistory:initialPayment(data),note:data.note,createdAt:now,updatedAt:now,draftId:draftId||null};
 subscriptions().push(sub);createVisitBookings(sub);
 if(draftId){const d=drafts().find(x=>x.id===draftId);if(d){d.status='approved';d.subscriptionId=sub.id;d.paid=data.paid;d.approvedAt=now;d.updatedAt=now}}
 await saveAll();window.closeSubscriptionModal?.();renderSubscriptionFinancePanel();
 alert(remaining>0?`✅ تم اعتماد الاشتراك رسميًا.\n⚠️ المتبقي على العميل: ${money(remaining)}`:'✅ تم اعتماد الاشتراك رسميًا ومكتمل السداد.');
 return true;
}
async function approveFromForm(){return createOfficial(formData())}
async function approveDraft(id){
 const d=drafts().find(x=>x.id===id);if(!d||d.status==='approved')return;
 const currentPaid=num(d.paid),value=prompt(`إجمالي الاشتراك ${money(d.total)}\nأدخل إجمالي المبلغ المستلم حتى الآن:`,String(currentPaid));if(value===null)return;
 const paid=num(value);if(paid>d.total){alert('المبلغ المستلم أكبر من قيمة الاشتراك.');return}
 return createOfficial({...d,paid},id);
}
async function addPayment(subscriptionId){
 const sub=subscriptions().find(x=>x.id===subscriptionId);if(!sub)return;
 const due=Math.max(0,num(sub.total)-num(sub.paid));if(due<=0){alert('الاشتراك مكتمل السداد.');return}
 const value=prompt(`المتبقي الحالي ${money(due)}\nأدخل قيمة الدفعة الجديدة:`,'');if(value===null)return;
 const amount=num(value);if(amount<=0){alert('أدخل مبلغًا صحيحًا.');return}if(amount>due){alert(`الدفعة أكبر من المتبقي (${money(due)}).`);return}
 const method=prompt('طريقة الدفع (اختياري):','تحويل')??'تحويل';
 const note=prompt('ملاحظة على الدفعة (اختياري):','')??'';
 sub.paymentHistory=Array.isArray(sub.paymentHistory)?sub.paymentHistory:[];sub.paymentHistory.push({id:uuid(),amount,date:new Date().toISOString(),method,note});
 sub.paid=num(sub.paid)+amount;sub.remaining=Math.max(0,num(sub.total)-sub.paid);sub.paymentStatus=sub.remaining>0?'مدفوع جزئيًا':'مدفوع بالكامل';sub.status=sub.remaining>0?'partial':'paid';sub.updatedAt=new Date().toISOString();
 const d=drafts().find(x=>x.subscriptionId===sub.id);if(d){d.paid=sub.paid;d.updatedAt=sub.updatedAt}
 await saveAll();renderSubscriptionFinancePanel();alert(sub.remaining>0?`تم تسجيل الدفعة. المتبقي ${money(sub.remaining)}.`:'تم تسجيل الدفعة واكتمل سداد الاشتراك.');
}
function remainingHold(d){const ms=new Date(d.expiresAt).getTime()-Date.now();if(ms<=0)return'منتهي';return`${Math.floor(ms/3600000)}س ${Math.floor(ms%3600000/60000)}د`}
function occupancy(date){
 const held=heldDates().get(date);if(held)return{kind:'temporary',name:held.name||'عميل',label:`⏳ ${held.name||'حجز مؤقت'}`,sub:'حجز مؤقت',time:remainingHold(held)};
 const b=bookingOn(date);if(b)return{kind:b.subscriptionVisit?'subscription':'official',name:b.name||'عميل',label:b.name||'محجوز',sub:b.subscriptionVisit?'اشتراك':'حجز رسمي'};
 return null;
}
function decorateSubscriptionCalendar(){
 for(const btn of document.querySelectorAll('#subscriptionCalendar .subscription-day')){
  const date=String(btn.getAttribute('onclick')||'').match(/'([^']+)'/)?.[1];if(!date)continue;
  btn.querySelectorAll('.subscription-customer-name,.subscription-booking-kind').forEach(x=>x.remove());
  const o=occupancy(date);if(!o)continue;
  const name=document.createElement('span');name.className=`subscription-customer-name ${o.kind}`;name.textContent=o.name;btn.appendChild(name);
  const kind=document.createElement('span');kind.className=`subscription-booking-kind ${o.kind}`;kind.textContent=o.kind==='temporary'?`⏳ حجز مؤقت${o.time?` • ${o.time}`:''}`:o.sub;btn.appendChild(kind);
  if(o.kind==='temporary'){btn.classList.add('draft-held');btn.disabled=true}
 }
}
function extractDate(el){
 const raw=el.dataset?.date||el.getAttribute('data-day')||el.getAttribute('data-date')||String(el.getAttribute('onclick')||'').match(/(20\d{2}-\d{2}-\d{2})/)?.[1];
 return /^20\d{2}-\d{2}-\d{2}$/.test(raw||'')?raw:null;
}
function decorateMainCalendar(){
 for(const el of document.querySelectorAll('#calendar .day,.calendar .day,[data-date]')){
  const date=extractDate(el);if(!date)continue;
  el.querySelectorAll('.adwaa-calendar-customer').forEach(x=>x.remove());
  const o=occupancy(date);if(!o)continue;
  const tag=document.createElement('div');tag.className=`adwaa-calendar-customer ${o.kind}`;tag.innerHTML=`<b>${esc(o.name)}</b><small>${esc(o.kind==='temporary'?`⏳ حجز مؤقت${o.time?` • ${o.time}`:''}`:o.sub)}</small>`;el.appendChild(tag);
 }
}
function decorateCalendars(){decorateSubscriptionCalendar();decorateMainCalendar()}
function renderSubscriptionFinancePanel(){
 let root=document.getElementById('subscriptionFinancePanel');if(!root)return;
 const rows=subscriptions().slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 root.innerHTML=rows.length?rows.map(s=>{const paid=num(s.paid),due=Math.max(0,num(s.total)-paid),done=(s.dates||[]).filter(date=>parse(date)<new Date(new Date().setHours(0,0,0,0))).length;return`<article class="pro-sub-card"><div class="pro-sub-head"><div><h4>${esc(s.name)} — ${esc(s.typeLabel||'اشتراك دوري')}</h4><div class="meta">${esc(s.phone||'')} • ${(s.dates||[]).length} زيارة • تمت ${done}/${(s.dates||[]).length}</div></div><span class="pro-sub-status ${due>0?'partial':'paid'}">${due>0?'مدفوع جزئيًا':'مكتمل السداد'}</span></div><div class="pro-sub-money"><div><span>الإجمالي</span><b>${money(s.total)}</b></div><div><span>المدفوع</span><b>${money(paid)}</b></div><div class="${due>0?'due':''}"><span>المتبقي</span><b>${money(due)}</b></div></div>${due>0?`<div class="pro-sub-warning">⚠️ يوجد مبلغ متبقي على العميل: <b>${money(due)}</b></div>`:''}<div class="actions">${due>0?`<button class="primary" type="button" onclick="addSubscriptionPayment('${s.id}')">تسجيل دفعة</button>`:''}<button class="secondary" type="button" onclick="copySubscriptionDatesPro('${s.id}')">نسخ الأيام</button></div></article>`}).join(''):'<div class="empty">لا توجد اشتراكات رسمية بعد.</div>';
}
function copyDates(id){const s=subscriptions().find(x=>x.id===id);if(!s)return;const text=(s.dates||[]).join('\n');navigator.clipboard?.writeText(text).then(()=>alert('تم نسخ الأيام.')).catch(()=>prompt('انسخ الأيام:',text))}
function installUi(){
 const modal=document.getElementById('subscriptionModal');
 const confirmBtn=document.getElementById('subConfirm');if(confirmBtn&&!confirmBtn.dataset.proBound){confirmBtn.dataset.proBound='1';confirmBtn.textContent='✅ اعتماد كاشتراك رسمي';confirmBtn.onclick=approveFromForm}
 const draftBtn=document.getElementById('saveSubscriptionDraft');if(draftBtn){draftBtn.textContent='⏳ حفظ كحجز مبدئي 24 ساعة';draftBtn.title='يحجز الأيام مؤقتًا فقط لمدة 24 ساعة'}
 const view=document.getElementById('customersView');if(view&&!document.getElementById('subscriptionFinancePanel')){const section=document.createElement('div');section.className='section';section.innerHTML='<div class="section-head"><div><h3>الاشتراكات الرسمية</h3><div class="meta">الحساب المالي للاشتراك كامل، والزيارات مواعيد مرتبطة به.</div></div></div><div id="subscriptionFinancePanel" class="pro-sub-panel"></div>';view.appendChild(section)}
 renderSubscriptionFinancePanel();decorateCalendars();
}
function styles(){if(document.getElementById('subscriptionProfessionalStyles'))return;const s=document.createElement('style');s.id='subscriptionProfessionalStyles';s.textContent=`
.subscription-customer-name{display:block;margin-top:4px;padding:3px 4px;border-radius:7px;font-size:10px;font-weight:900;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#e8f5f0;color:#116951}.subscription-customer-name.temporary{background:#fff0c7;color:#8a5a00}.subscription-booking-kind{display:block;font-size:9px;font-weight:800;margin-top:2px;color:#69736f}.subscription-booking-kind.temporary{color:#9a6500}.adwaa-calendar-customer{margin-top:4px;border-radius:8px;padding:4px;background:#e8f5f0;color:#116951;font-size:10px;line-height:1.25}.adwaa-calendar-customer.temporary{background:#fff0c7;color:#8a5a00}.adwaa-calendar-customer b,.adwaa-calendar-customer small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pro-sub-panel{display:grid;gap:10px;padding:14px}.pro-sub-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px}.pro-sub-head{display:flex;justify-content:space-between;gap:10px}.pro-sub-head h4{margin:0 0 5px}.pro-sub-status{border-radius:999px;padding:6px 9px;height:max-content;font-size:11px;font-weight:900}.pro-sub-status.partial{background:#fff0c7;color:#8a5a00}.pro-sub-status.paid{background:#e5f5ee;color:#116951}.pro-sub-money{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}.pro-sub-money>div{border:1px solid var(--line);border-radius:11px;padding:9px}.pro-sub-money span{display:block;color:var(--muted);font-size:11px}.pro-sub-money .due b{color:#a56b00}.pro-sub-warning{background:#fff3d9;border:1px solid #e1b84c;border-radius:11px;padding:9px;margin:8px 0;color:#805800}@media(max-width:620px){.pro-sub-money{grid-template-columns:1fr}.subscription-day{min-height:92px!important}}
`;document.head.appendChild(s)}

window.approveSubscriptionDraft=approveDraft;
window.addSubscriptionPayment=addPayment;
window.copySubscriptionDatesPro=copyDates;
window.approveSubscriptionOfficial=approveFromForm;

function init(){styles();installUi();const obs=new MutationObserver(()=>{installUi();decorateCalendars()});obs.observe(document.body,{childList:true,subtree:true});setInterval(()=>{installUi();decorateCalendars()},3000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
