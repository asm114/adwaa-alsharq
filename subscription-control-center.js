(()=>{
'use strict';
if(window.__adwaaSubscriptionControlCenterInstalled)return;
window.__adwaaSubscriptionControlCenterInstalled=true;

const num=value=>Math.max(0,Number(value||0));
const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>`${num(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const uuid=()=>crypto.randomUUID?.()||`sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let activeSubscriptionVisitId='';

function db(){return window.db||null}
function subscriptions(){if(!db())return[];db().subscriptions=Array.isArray(db().subscriptions)?db().subscriptions:[];return db().subscriptions}
function drafts(){return Array.isArray(db()?.subscriptionDrafts)?db().subscriptionDrafts:[]}
function bookings(){return Array.isArray(db()?.bookings)?db().bookings:[]}
function officialById(id){return subscriptions().find(row=>row?.id===id)||null}
function linkedVisits(id){return bookings().filter(row=>row?.subscriptionId===id&&row.status!=='ملغي').sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))}
function legacyDraftById(id){return drafts().find(row=>row?.subscriptionId===id||row?.id===id)||null}
function subscriptionRecord(id){
 const official=officialById(id);if(official)return{...official,__official:true};
 const draft=legacyDraftById(id);if(draft)return{...draft,id,__official:false,__draftId:draft.id};
 const visits=linkedVisits(id);if(!visits.length)return null;
 const first=visits[0],total=Math.max(...visits.map(v=>num(v.subscriptionValue)),0);
 return{id,name:first.name||'',phone:first.phone||'',type:'custom',typeLabel:'اشتراك دوري',visits:visits.length,dates:visits.map(v=>v.date).filter(Boolean),total,paid:0,paymentHistory:[],__official:false,__legacyOnly:true};
}
function finance(sub){
 if(sub?.__official&&typeof window.subscriptionFinancialStats==='function')return window.subscriptionFinancialStats(sub);
 const total=num(sub?.total),paid=num(sub?.paid);return{total,paid:Math.min(total,paid),due:Math.max(0,total-paid)};
}
function stats(sub){
 if(sub?.__official&&typeof window.subscriptionVisitStats==='function')return window.subscriptionVisitStats(sub);
 const rows=linkedVisits(sub?.id),total=Math.max(1,Number(sub?.visits||sub?.dates?.length||rows.length||1)),used=rows.filter(row=>row.status==='تم الخروج').length,reserved=rows.filter(row=>row.status!=='تم الخروج').length;
 return{total,used,upcoming:reserved,remaining:Math.max(0,total-used),unallocated:Math.max(0,total-used-reserved)};
}
async function persistAndRefresh(){
 if(typeof window.persist==='function')await window.persist();
 window.renderAll?.();window.renderCustomers?.();window.dispatchEvent(new Event('adwaa-subscription-updated'));
}
async function syncSubscriptionDatesFromVisits(subscriptionId){
 if(!subscriptionId)return;
 const dates=linkedVisits(subscriptionId).map(v=>v.date).filter(Boolean).sort(),now=new Date().toISOString();
 const official=officialById(subscriptionId);if(official){official.dates=dates;official.updatedAt=now}
 const draft=legacyDraftById(subscriptionId);if(draft){draft.dates=[...dates];draft.updatedAt=now}
 if(official||draft)await persistAndRefresh();
}

function installStyles(){
 if(document.getElementById('subscriptionControlCenterStyles'))return;
 const style=document.createElement('style');style.id='subscriptionControlCenterStyles';style.textContent=`
 .subscription-manage-btn{font-weight:900}.subscription-control-sheet{max-width:720px}.subscription-control-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.subscription-control-summary>div{border:1px solid var(--line);border-radius:13px;padding:10px;background:#fff}.subscription-control-summary small,.subscription-control-summary b{display:block}.subscription-control-summary .due{background:#fff8e8;border-color:#e1aa38}.subscription-control-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.subscription-visit-list{display:grid;gap:8px;margin-top:12px}.subscription-visit-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}.subscription-visit-row .meta{margin-top:3px}.subscription-main-note{background:#eef4ff;border:1px solid #9db8ff;color:#183b82;border-radius:12px;padding:10px;margin:10px 0}.subscription-legacy-note{background:#fff8e8;border:1px solid #e1aa38;color:#76520b;border-radius:12px;padding:10px;margin:10px 0}.subscription-visit-lock{background:#eef4ff;border:1px solid #9db8ff;color:#183b82;border-radius:12px;padding:10px;margin:0 0 12px;font-weight:800}.subscription-finance-locked{opacity:.65;pointer-events:none}@media(max-width:620px){.subscription-control-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.subscription-visit-row{align-items:flex-start;flex-direction:column}}
 `;document.head.appendChild(style);
}
function ensureModal(){
 let modal=document.getElementById('subscriptionControlModal');if(modal)return modal;
 modal=document.createElement('div');modal.className='modal';modal.id='subscriptionControlModal';modal.innerHTML=`<div class="sheet subscription-control-sheet"><div class="sheet-head"><div><h2 style="margin:0">🎟️ إدارة الاشتراك</h2><div class="meta">المكان الرئيسي للمال والتعديلات والزيارات.</div></div><button class="close" type="button" onclick="closeSubscriptionControlCenter()">×</button></div><div id="subscriptionControlBody"></div></div>`;document.body.appendChild(modal);return modal;
}
function paymentHistory(sub){
 const rows=Array.isArray(sub?.paymentHistory)?sub.paymentHistory:[];
 return rows.length?rows.slice().reverse().map(row=>`<div class="subscription-visit-row"><div><b>${money(row.amount)}</b><div class="meta">${esc(new Date(row.date).toLocaleString('ar-SA'))} • ${esc(row.method||'غير محدد')}${row.note?` • ${esc(row.note)}`:''}</div></div></div>`).join(''):'<div class="empty">لا توجد دفعات مسجلة.</div>';
}
function visitLabel(index,total){return `الزيارة ${index+1} من ${total}`}
function renderControl(id){
 const sub=subscriptionRecord(id),root=document.getElementById('subscriptionControlBody');if(!root)return;
 if(!sub){root.innerHTML='<div class="empty">تعذر العثور على سجل الاشتراك.</div>';return}
 const f=finance(sub),s=stats(sub),visits=linkedVisits(id),official=!!sub.__official;
 const actions=official
  ?`<button class="primary" type="button" onclick="subscriptionControlAddPayment('${esc(id)}')">💰 تسجيل دفعة</button><button class="secondary" type="button" onclick="subscriptionControlEdit('${esc(id)}')">✏️ تعديل الاشتراك</button><button class="secondary" type="button" onclick="subscriptionControlTransfer('${esc(id)}')">📅 ترحيل الأيام للبوابة</button>`
  :`<button class="primary" type="button" onclick="subscriptionControlInitializeLegacy('${esc(id)}')">✅ تهيئة الاشتراك الرئيسي</button>`;
 root.innerHTML=`
 <div class="subscription-main-note"><b>${esc(sub.name||'عميل')} — ${esc(sub.typeLabel||'اشتراك')}</b><div class="meta">هذا هو السجل الرئيسي للاشتراك. الدفعات وتعديل القيمة وعدد الزيارات تتم من هنا فقط.</div></div>
 ${official?'':`<div class="subscription-legacy-note">⚠️ الزيارات مرتبطة باشتراك قديم، لكن السجل المالي الرئيسي غير مكتمل. اضغط «تهيئة الاشتراك الرئيسي» مرة واحدة لتثبيت الإجمالي والمدفوع وسجل الدفعات بدون تغيير الزيارات.</div>`}
 <div class="subscription-control-summary"><div><small>قيمة الاشتراك</small><b>${f.total>0?money(f.total):'غير مسجلة'}</b></div><div><small>المدفوع</small><b>${official||num(sub.paid)>0?money(f.paid):'يحتاج تأكيد'}</b></div><div class="${f.due>0?'due':''}"><small>المتبقي</small><b>${official||num(sub.paid)>0?money(f.due):'يحتاج تأكيد'}</b></div><div><small>إجمالي الزيارات</small><b>${s.total}</b></div><div><small>تمت</small><b>${s.used}</b></div><div><small>غير المجدولة</small><b>${s.unallocated}</b></div></div>
 ${official&&f.due>0?`<div class="subscription-due-warning">⚠️ متبقي على العميل ${money(f.due)}</div>`:''}
 <div class="subscription-control-actions">${actions}</div>
 <details open><summary><b>الزيارات (${visits.length})</b></summary><div class="subscription-visit-list">${visits.length?visits.map((visit,index)=>`<div class="subscription-visit-row"><div><b>${visitLabel(index,s.total)} — ${esc(visit.date||'بدون تاريخ')}</b><div class="meta">${esc(visit.status||'مؤكد')} • ${esc(visit.code||'')}</div></div><button class="secondary" type="button" onclick="subscriptionControlOpenVisit('${esc(visit.id)}')">تعديل الزيارة</button></div>`).join(''):'<div class="empty">لا توجد زيارات مرتبطة.</div>'}</div></details>
 ${official?`<details><summary><b>سجل الدفعات (${Array.isArray(sub.paymentHistory)?sub.paymentHistory.length:0})</b></summary><div class="subscription-visit-list">${paymentHistory(sub)}</div></details>`:''}`;
}
window.openSubscriptionControlCenter=id=>{ensureModal();renderControl(id);document.getElementById('subscriptionControlModal')?.classList.add('open')};
window.closeSubscriptionControlCenter=()=>document.getElementById('subscriptionControlModal')?.classList.remove('open');
window.subscriptionControlAddPayment=id=>{window.closeSubscriptionControlCenter();if(typeof window.addSubscriptionPayment==='function')window.addSubscriptionPayment(id);else alert('تعذر فتح تسجيل الدفعة الآن.')};
window.subscriptionControlEdit=id=>{window.closeSubscriptionControlCenter();if(typeof window.editOfficialSubscription==='function')window.editOfficialSubscription(id);else alert('تعذر فتح تعديل الاشتراك الآن.')};
window.subscriptionControlTransfer=id=>{if(typeof window.transferOfficialSubscriptionToPortal==='function')window.transferOfficialSubscriptionToPortal(id);else alert('تعذر ترحيل الأيام الآن.')};
window.subscriptionControlOpenVisit=id=>{window.closeSubscriptionControlCenter();if(typeof window.openBooking==='function')window.openBooking(id);else alert('تعذر فتح الزيارة الآن.')};
window.subscriptionControlInitializeLegacy=async id=>{
 const current=subscriptionRecord(id);if(!current||current.__official)return;
 const visits=linkedVisits(id),defaultTotal=num(current.total)||Math.max(...visits.map(v=>num(v.subscriptionValue)),0),totalValue=prompt('قيمة الاشتراك الرئيسية:',String(defaultTotal||''));if(totalValue===null)return;
 const total=num(totalValue);if(total<=0){alert('أدخل قيمة اشتراك صحيحة.');return}
 const paidValue=prompt('إجمالي المبلغ المستلم حتى الآن:',String(num(current.paid)||0));if(paidValue===null)return;
 const paid=num(paidValue);if(paid>total){alert('المدفوع لا يمكن أن يكون أكبر من قيمة الاشتراك.');return}
 if(!confirm(`تهيئة الاشتراك الرئيسي؟\n\nالإجمالي: ${money(total)}\nالمدفوع: ${money(paid)}\nالمتبقي: ${money(total-paid)}\n\nلن يتم إنشاء زيارات جديدة أو حذف الزيارات الحالية.`))return;
 const now=new Date().toISOString(),draft=legacyDraftById(id),dates=visits.map(v=>v.date).filter(Boolean).sort(),record={
  id,name:current.name||visits[0]?.name||'',phone:current.phone||visits[0]?.phone||'',type:current.type||'custom',typeLabel:current.typeLabel||'اشتراك دوري',
  visits:Math.max(Number(current.visits||0),dates.length),dates,total,paid,remaining:Math.max(0,total-paid),paymentManaged:true,paymentStatus:total-paid>0?'مدفوع جزئيًا':'مدفوع بالكامل',
  paymentHistory:paid>0?[{id:uuid(),amount:paid,date:now,method:'غير محدد',note:'الرصيد المسجل عند تهيئة الاشتراك الرئيسي'}]:[],note:current.note||'',status:total-paid>0?'partial':'paid',createdAt:current.createdAt||now,updatedAt:now,draftId:draft?.id||null,portalTransferredDates:current.portalTransferredDates||[]
 };
 subscriptions().push(record);
 for(const visit of visits){visit.subscriptionVisit=true;visit.subscriptionPaymentManaged=true;visit.subscriptionValue=total;visit.total=0;visit.paid=0;visit.updatedAt=now}
 if(draft){draft.subscriptionId=id;draft.status='approved';draft.total=total;draft.paid=paid;draft.updatedAt=now}
 await persistAndRefresh();renderControl(id);alert('✅ تم تهيئة الاشتراك الرئيسي وربطه بالزيارات الحالية.');
};

function cardSubscriptionId(card){
 const calls=[...card.querySelectorAll('button[onclick]')].map(button=>button.getAttribute('onclick')||'').join(' ');
 return calls.match(/(?:addSubscriptionPayment|transferOfficialSubscriptionToPortal|editOfficialSubscription)\('([^']+)'\)/)?.[1]||'';
}
function centralizeOfficialCards(){
 const root=document.getElementById('subscriptionOfficialPanel');if(!root)return;
 for(const card of root.querySelectorAll('.draft-card')){
  const id=cardSubscriptionId(card);if(!id)continue;
  const actions=card.querySelector('.actions');if(!actions)continue;
  for(const button of [...actions.querySelectorAll('button')]){
   const call=button.getAttribute('onclick')||'';
   if(/addSubscriptionPayment|transferOfficialSubscriptionToPortal|editOfficialSubscription/.test(call))button.style.display='none';
  }
  let manage=actions.querySelector('[data-subscription-manage]');
  if(!manage){manage=document.createElement('button');manage.type='button';manage.className='primary subscription-manage-btn';manage.dataset.subscriptionManage='1';manage.textContent='⚙️ إدارة الاشتراك';manage.onclick=()=>window.openSubscriptionControlCenter(id);actions.prepend(manage)}
 }
}
function visitBooking(id){const row=bookings().find(item=>item?.id===id);return row?.subscriptionId||row?.subscriptionVisit?row:null}
function lockVisitFinance(id){
 const booking=visitBooking(id);activeSubscriptionVisitId=booking?.id||'';
 const modal=document.getElementById('bookingModal');if(!modal)return;
 let note=modal.querySelector('.subscription-visit-lock');
 if(!booking){note?.remove();for(const fieldId of ['bTotal','bPaid']){const field=document.getElementById(fieldId);if(field){field.disabled=false;field.closest('label')?.classList.remove('subscription-finance-locked')}}return}
 if(!note){note=document.createElement('div');note.className='subscription-visit-lock';const head=modal.querySelector('.sheet-head');head?.insertAdjacentElement('afterend',note)}
 note.innerHTML=`🎟️ هذه زيارة ضمن اشتراك. <b>المال وعدد الزيارات يُعدّل من الاشتراك الرئيسي فقط.</b> هنا يمكنك تعديل موعد الزيارة وحالتها وملاحظاتها التشغيلية.`;
 for(const fieldId of ['bTotal','bPaid']){const field=document.getElementById(fieldId);if(!field)continue;field.value='0';field.disabled=true;field.closest('label')?.classList.add('subscription-finance-locked')}
}
function wrapOpenBooking(){
 if(typeof window.openBooking!=='function'||window.openBooking.__subscriptionControlWrapped)return;
 const original=window.openBooking;const wrapped=function(...args){const result=original.apply(this,args);const id=args[0];setTimeout(()=>lockVisitFinance(id),0);return result};wrapped.__subscriptionControlWrapped=true;window.openBooking=wrapped;
}
document.addEventListener('submit',event=>{
 if(!activeSubscriptionVisitId)return;
 const form=event.target;if(!form?.querySelector?.('#bTotal')&&!form?.querySelector?.('#bPaid'))return;
 const visitId=activeSubscriptionVisitId,booking=visitBooking(visitId);if(!booking){activeSubscriptionVisitId='';return}
 const subscriptionId=booking.subscriptionId,expectedDate=String(document.getElementById('bDate')?.value||'');
 const total=document.getElementById('bTotal'),paid=document.getElementById('bPaid');if(total){total.disabled=false;total.value='0'}if(paid){paid.disabled=false;paid.value='0'}
 setTimeout(async()=>{const saved=visitBooking(visitId);if(saved&&saved.subscriptionId===subscriptionId&&(!expectedDate||saved.date===expectedDate))await syncSubscriptionDatesFromVisits(subscriptionId);lockVisitFinance(visitId)},450);
},true);
function init(){installStyles();ensureModal();wrapOpenBooking();centralizeOfficialCards();const observer=new MutationObserver(()=>{try{wrapOpenBooking();centralizeOfficialCards()}catch(error){console.warn('تعذر تحديث مركز الاشتراك',error)}});observer.observe(document.body,{childList:true,subtree:true});setInterval(()=>{wrapOpenBooking();centralizeOfficialCards()},2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
