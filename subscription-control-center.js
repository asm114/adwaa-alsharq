(()=>{
'use strict';
if(window.__adwaaSubscriptionControlCenterInstalled)return;
window.__adwaaSubscriptionControlCenterInstalled=true;

const num=value=>Math.max(0,Number(value||0));
const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>`${num(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
let activeSubscriptionVisitId='';

function db(){return window.db||null}
function subscriptions(){return Array.isArray(db()?.subscriptions)?db().subscriptions:[]}
function bookings(){return Array.isArray(db()?.bookings)?db().bookings:[]}
function subscriptionById(id){return subscriptions().find(row=>row?.id===id)||null}
function linkedVisits(id){return bookings().filter(row=>row?.subscriptionId===id&&row.status!=='ملغي').sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))}
function finance(sub){return typeof window.subscriptionFinancialStats==='function'?window.subscriptionFinancialStats(sub):{total:num(sub?.total),paid:num(sub?.paid),due:Math.max(0,num(sub?.total)-num(sub?.paid))}}
function stats(sub){return typeof window.subscriptionVisitStats==='function'?window.subscriptionVisitStats(sub):{total:Number(sub?.visits||0),used:0,upcoming:linkedVisits(sub?.id).length,remaining:Number(sub?.visits||0),unallocated:0}}

function installStyles(){
 if(document.getElementById('subscriptionControlCenterStyles'))return;
 const style=document.createElement('style');style.id='subscriptionControlCenterStyles';style.textContent=`
 .subscription-manage-btn{font-weight:900}.subscription-control-sheet{max-width:720px}.subscription-control-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.subscription-control-summary>div{border:1px solid var(--line);border-radius:13px;padding:10px;background:#fff}.subscription-control-summary small,.subscription-control-summary b{display:block}.subscription-control-summary .due{background:#fff8e8;border-color:#e1aa38}.subscription-control-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.subscription-visit-list{display:grid;gap:8px;margin-top:12px}.subscription-visit-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}.subscription-visit-row .meta{margin-top:3px}.subscription-main-note{background:#f4f1ff;border:1px solid #cfc8ff;color:#4035a8;border-radius:12px;padding:10px;margin:10px 0}.subscription-visit-lock{background:#f4f1ff;border:1px solid #cfc8ff;color:#4035a8;border-radius:12px;padding:10px;margin:0 0 12px;font-weight:800}.subscription-finance-locked{opacity:.65;pointer-events:none}@media(max-width:620px){.subscription-control-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.subscription-visit-row{align-items:flex-start;flex-direction:column}}
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
 const sub=subscriptionById(id),root=document.getElementById('subscriptionControlBody');if(!sub||!root)return;
 const f=finance(sub),s=stats(sub),visits=linkedVisits(id);
 root.innerHTML=`
 <div class="subscription-main-note"><b>${esc(sub.name||'عميل')} — ${esc(sub.typeLabel||'اشتراك')}</b><div class="meta">هذا هو السجل الرئيسي للاشتراك. الدفعات وتعديل القيمة وعدد الزيارات تتم من هنا فقط.</div></div>
 <div class="subscription-control-summary"><div><small>قيمة الاشتراك</small><b>${money(f.total)}</b></div><div><small>المدفوع</small><b>${money(f.paid)}</b></div><div class="${f.due>0?'due':''}"><small>المتبقي</small><b>${money(f.due)}</b></div><div><small>إجمالي الزيارات</small><b>${s.total}</b></div><div><small>المستخدمة</small><b>${s.used}</b></div><div><small>المتبقية</small><b>${s.remaining}</b></div></div>
 ${f.due>0?`<div class="subscription-due-warning">⚠️ متبقي على العميل ${money(f.due)}</div>`:''}
 <div class="subscription-control-actions"><button class="primary" type="button" onclick="subscriptionControlAddPayment('${esc(sub.id)}')">💰 تسجيل دفعة</button><button class="secondary" type="button" onclick="subscriptionControlEdit('${esc(sub.id)}')">✏️ تعديل الاشتراك</button><button class="secondary" type="button" onclick="subscriptionControlTransfer('${esc(sub.id)}')">📅 ترحيل الأيام للبوابة</button></div>
 <details open><summary><b>الزيارات (${visits.length})</b></summary><div class="subscription-visit-list">${visits.length?visits.map((visit,index)=>`<div class="subscription-visit-row"><div><b>${visitLabel(index,s.total)} — ${esc(visit.date||'بدون تاريخ')}</b><div class="meta">${esc(visit.status||'مؤكد')} • ${esc(visit.code||'')}</div></div><button class="secondary" type="button" onclick="subscriptionControlOpenVisit('${esc(visit.id)}')">تعديل الزيارة</button></div>`).join(''):'<div class="empty">لا توجد زيارات مرتبطة.</div>'}</div></details>
 <details><summary><b>سجل الدفعات (${Array.isArray(sub.paymentHistory)?sub.paymentHistory.length:0})</b></summary><div class="subscription-visit-list">${paymentHistory(sub)}</div></details>`;
}
window.openSubscriptionControlCenter=id=>{ensureModal();renderControl(id);document.getElementById('subscriptionControlModal')?.classList.add('open')};
window.closeSubscriptionControlCenter=()=>document.getElementById('subscriptionControlModal')?.classList.remove('open');
window.subscriptionControlAddPayment=id=>{window.closeSubscriptionControlCenter();if(typeof window.addSubscriptionPayment==='function')window.addSubscriptionPayment(id);else alert('تعذر فتح تسجيل الدفعة الآن.')};
window.subscriptionControlEdit=id=>{window.closeSubscriptionControlCenter();if(typeof window.editOfficialSubscription==='function')window.editOfficialSubscription(id);else alert('تعذر فتح تعديل الاشتراك الآن.')};
window.subscriptionControlTransfer=id=>{if(typeof window.transferOfficialSubscriptionToPortal==='function')window.transferOfficialSubscriptionToPortal(id);else alert('تعذر ترحيل الأيام الآن.')};
window.subscriptionControlOpenVisit=id=>{window.closeSubscriptionControlCenter();if(typeof window.openBooking==='function')window.openBooking(id);else alert('تعذر فتح الزيارة الآن.')};

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
 const booking=visitBooking(activeSubscriptionVisitId);if(!booking){activeSubscriptionVisitId='';return}
 const total=document.getElementById('bTotal'),paid=document.getElementById('bPaid');if(total){total.disabled=false;total.value='0'}if(paid){paid.disabled=false;paid.value='0'}
 setTimeout(()=>lockVisitFinance(activeSubscriptionVisitId),0);
},true);
function init(){installStyles();ensureModal();wrapOpenBooking();centralizeOfficialCards();const observer=new MutationObserver(()=>{try{wrapOpenBooking();centralizeOfficialCards()}catch(error){console.warn('تعذر تحديث مركز الاشتراك',error)}});observer.observe(document.body,{childList:true,subtree:true});setInterval(()=>{wrapOpenBooking();centralizeOfficialCards()},2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
