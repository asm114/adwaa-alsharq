(()=>{
'use strict';
if(window.__adwaaProfessionalUiStableInstalled)return;
window.__adwaaProfessionalUiStableInstalled=true;

const state=()=>window.db||{};
const bookings=()=>Array.isArray(state().bookings)?state().bookings:[];
const expenses=()=>Array.isArray(state().expenses)?state().expenses:[];
const subscriptions=()=>Array.isArray(state().subscriptions)?state().subscriptions:[];
const money=value=>typeof window.money==='function'?window.money(value):`${Math.max(0,Number(value||0)).toLocaleString('ar-SA')} ر.س`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
const activeViewId=()=>document.querySelector('.view.active')?.id||'';
const inBookings=()=>activeViewId()==='bookings';

function cleanVoiceUi(){
  document.querySelectorAll('.voice,[onclick*="startVoice"],[onclick*="parseVoice"]').forEach(el=>el.remove());
  document.querySelectorAll('button,a,.notice,.section-head').forEach(el=>{
    const text=norm(el.textContent);
    if(/أمر صوتي|أوامر صوتية|إدخال صوتي|تسجيل صوتي/.test(text)&&el.closest('#bookingModal'))el.remove();
  });
}
function scopeAddBooking(){
  const headerButton=document.getElementById('headerAddBooking');
  if(headerButton){const display=inBookings()?'':'none';if(headerButton.style.display!==display)headerButton.style.display=display}
  document.querySelectorAll('[data-action="booking"]').forEach(el=>el.remove());
}
function clarifyBookingActions(){
  document.querySelectorAll('#bookingModal button').forEach(button=>{
    const text=norm(button.textContent);
    if(text==='تحديث البيانات'||text==='تحديث'||text==='حفظ التعديلات')button.textContent='تحديث من المصدر';
    if(text==='رجوع للحجز')button.textContent='رجوع بدون حفظ';
  });
}
function setFinanceAllPeriods(){
  const select=document.getElementById('financePeriod');if(!select)return;
  if(![...select.options].some(o=>o.value==='all')){const option=document.createElement('option');option.value='all';option.textContent='كل الفترات';select.insertBefore(option,select.firstChild)}
  if(!select.dataset.defaultAllApplied){select.dataset.defaultAllApplied='1';select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}))}
}
function commissionStatus(row){
  if(typeof window.commissionStatus==='function'){
    try{return window.commissionStatus(row)}catch(error){console.warn('تعذر قراءة حالة العمولة المركزية',error)}
  }
  if(row?.recordType==='family')return 'no_commission';
  const snap=row?.commissionSnapshot||{};
  if(row?.commissionReceivedBeforeSystem||['received_before_system','legacy_received','received_pre_system'].includes(String(snap.status||'')))return 'received_before_system';
  if(snap.status==='received'||snap.received||snap.receivedAt||row?.commissionReceivedAt)return 'received';
  if(snap.status==='no_commission'||row?.status==='ملغي')return 'no_commission';
  if(snap.status==='earned')return 'earned';
  return 'not_earned';
}
function commissionAmount(row){return Math.max(0,Number(typeof window.managerCommissionAmount==='function'?window.managerCommissionAmount(row):row?.commissionSnapshot?.amount||0))}
function subscriptionCommissionStatus(row){return typeof window.subscriptionCommissionStatus==='function'?window.subscriptionCommissionStatus(row):(row?.commissionSnapshot?.status||'not_earned')}
function subscriptionCommissionAmount(row){return Math.max(0,Number(typeof window.subscriptionCommissionAmount==='function'?window.subscriptionCommissionAmount(row):row?.commissionSnapshot?.amount||0))}
function periodValue(){return document.getElementById('financePeriod')?.value||'all'}
function dateMatch(value,period=periodValue()){
  if(period==='all')return true;
  const date=String(value||'').slice(0,10),today=new Date(),todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if(period==='today')return date===todayIso;
  if(period==='month')return date.slice(0,7)===todayIso.slice(0,7);
  if(period==='year')return date.slice(0,4)===todayIso.slice(0,4);
  return true;
}
function isSubscriptionVisit(row){return !!(row?.subscriptionPaymentManaged||row?.subscriptionId)}
function periodBookings(){return bookings().filter(row=>row.status!=='ملغي'&&row.recordType!=='family'&&!isSubscriptionVisit(row)&&dateMatch(row.date))}
function periodSubscriptions(){return subscriptions().filter(row=>row?.paymentManaged===true&&!/ملغي|cancel/i.test(String(row?.status||''))&&dateMatch(row.createdAt||row.updatedAt))}
function subscriptionPayments(){
  const rows=[];
  subscriptions().filter(s=>s?.paymentManaged===true&&s?.status!=='ملغي').forEach(sub=>{
    const history=Array.isArray(sub.paymentHistory)?sub.paymentHistory:[];
    let recorded=0;
    history.forEach(p=>{const amount=Math.max(0,Number(p?.amount||0));if(amount){recorded+=amount;rows.push({name:sub.customerName||sub.name||'اشتراك دوري',date:p?.date||p?.createdAt||sub.createdAt||'',amount})}});
    const paid=Math.max(0,Number(sub.paid||0));if(paid>recorded)rows.push({name:sub.customerName||sub.name||'اشتراك دوري',date:sub.createdAt||sub.updatedAt||'',amount:paid-recorded});
  });
  return rows.filter(r=>dateMatch(r.date));
}
function ensureDetailModal(){
  if(document.getElementById('professionalFinanceModal'))return;
  const modal=document.createElement('div');modal.id='professionalFinanceModal';modal.className='modal';modal.innerHTML='<div class="sheet" style="max-width:760px;margin:auto"><div class="sheet-head"><h2 id="professionalFinanceTitle">التفاصيل</h2><button class="close" type="button" data-close>×</button></div><div id="professionalFinanceBody"></div></div>';
  modal.querySelector('[data-close]').onclick=()=>modal.classList.remove('open');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});document.body.appendChild(modal);
}
function openDetails(title,html){ensureDetailModal();document.getElementById('professionalFinanceTitle').textContent=title;document.getElementById('professionalFinanceBody').innerHTML=html;document.getElementById('professionalFinanceModal').classList.add('open')}
function detailList(rows,empty='لا توجد بيانات في الفترة المحددة'){return rows.length?`<div class="list">${rows.join('')}</div>`:`<div class="empty">${empty}</div>`}
function bookingRow(row,extra=''){
  const due=Math.max(0,Number(row.total||0)-Number(row.paid||0));
  return `<div class="item"><div><h4>${esc(row.name||'بدون اسم')} <span class="small">#${esc(row.code||'')}</span></h4><div class="meta">${esc(row.date||'')} • ${esc(row.type||'')}<br>الإجمالي ${esc(money(row.total))} • المدفوع ${esc(money(row.paid))} • المتبقي ${esc(money(due))}${extra?`<br>${extra}`:''}</div></div></div>`;
}
function subscriptionRow(row,extra=''){
  const due=Math.max(0,Number(row.total||0)-Number(row.paid||0));
  return `<div class="item"><div><h4>${esc(row.name||row.customerName||'اشتراك دوري')} <span class="small">اشتراك رئيسي</span></h4><div class="meta">${esc(String(row.createdAt||row.updatedAt||'').slice(0,10))} • ${Number(row.visits||row.dates?.length||0)} زيارة<br>الإجمالي ${esc(money(row.total))} • المدفوع ${esc(money(row.paid))} • المتبقي ${esc(money(due))}${extra?`<br>${extra}`:''}</div></div></div>`;
}
function expenseRow(row){return `<div class="item"><div><h4>${esc(row.title||row.cat||'مصروف')}</h4><div class="meta">${esc(row.date||'')} • ${esc(row.cat||'غير مصنف')} • ${esc(row.paymentMethod||'طريقة غير محددة')}${row.notes?`<br>${esc(row.notes)}`:''}</div></div><b>${esc(money(row.amount))}</b></div>`}
function subscriptionPaymentRow(row){return `<div class="item"><div><h4>${esc(row.name)} <span class="small">اشتراك دوري</span></h4><div class="meta">${esc(String(row.date||'').slice(0,10))}<br>دفعة اشتراك رئيسي — لا تتكرر على الزيارات</div></div><b>${esc(money(row.amount))}</b></div>`}
function showRevenue(){openDetails('تفاصيل الإيرادات',detailList([...periodBookings().filter(r=>Number(r.paid||0)>0).map(r=>bookingRow(r)),...subscriptionPayments().map(subscriptionPaymentRow)]))}
function showDue(){
  const ordinary=periodBookings().filter(r=>Number(r.total||0)>Number(r.paid||0)).map(r=>bookingRow(r,'⚠️ يوجد مبلغ لم يُستلم بعد'));
  const subs=periodSubscriptions().filter(s=>Number(s.total||0)>Number(s.paid||0)).map(s=>subscriptionRow(s,'⚠️ يوجد مبلغ لم يُستلم بعد'));
  openDetails('المبالغ المتبقية',detailList([...ordinary,...subs]));
}
function showExpenses(){openDetails('تفاصيل المصروفات',detailList(expenses().filter(r=>dateMatch(r.date)).map(expenseRow),'لا توجد مصروفات في الفترة المحددة'))}
function showCommission(mode){
  const rows=periodBookings(),subs=periodSubscriptions();
  if(mode==='received'){
    const ordinary=rows.filter(r=>commissionStatus(r)==='received').map(r=>bookingRow(r,`✅ تم تأكيد استلام العمولة • ${esc(money(commissionAmount(r)))}`));
    const packages=subs.filter(r=>subscriptionCommissionStatus(r)==='received').map(r=>subscriptionRow(r,`✅ تم تأكيد استلام عمولة الاشتراك • ${esc(money(subscriptionCommissionAmount(r)))}`));
    openDetails('العمولات المستلمة',detailList([...ordinary,...packages],'لا توجد عمولات مستلمة في الفترة المحددة'));return;
  }
  const earned=[
    ...rows.filter(r=>commissionStatus(r)==='earned').map(r=>bookingRow(r,`🟠 مستحقة ولم تؤكد تحويلها لحسابك • قيمة العمولة ${esc(money(commissionAmount(r)))}`)),
    ...subs.filter(r=>subscriptionCommissionStatus(r)==='earned').map(r=>subscriptionRow(r,`🟠 عمولة الاشتراك مستحقة مرة واحدة بعد اكتمال السداد • ${esc(money(subscriptionCommissionAmount(r)))}`))
  ];
  const waiting=[
    ...rows.filter(r=>commissionStatus(r)==='not_earned'&&Number(r.total||0)>0&&Number(r.paid||0)<Number(r.total||0)).map(r=>bookingRow(r,'🟡 لم تستحق بعد — العميل دفع عربون/جزئي ولم يكتمل السداد')),
    ...subs.filter(r=>subscriptionCommissionStatus(r)==='not_earned'&&Number(r.total||0)>0&&Number(r.paid||0)<Number(r.total||0)).map(r=>subscriptionRow(r,'🟡 عمولة الاشتراك تنتظر اكتمال سداد قيمة الباقة'))
  ];
  openDetails('متابعة عمولات المدير',`${detailList(earned,'لا توجد عمولات مستحقة الآن')}${waiting.length?`<div class="notice" style="margin-top:14px"><b>بانتظار اكتمال السداد</b></div>${detailList(waiting)}`:''}`);
}
function showProfit(){
  const ordinaryRevenue=periodBookings().reduce((sum,row)=>sum+Number(row.paid||0),0),subRevenue=subscriptionPayments().reduce((sum,row)=>sum+row.amount,0),cost=expenses().filter(row=>dateMatch(row.date)).reduce((sum,row)=>sum+Number(row.amount||0),0);
  const ordinaryReceived=periodBookings().filter(row=>commissionStatus(row)==='received').reduce((sum,row)=>sum+commissionAmount(row),0);
  const subscriptionReceived=periodSubscriptions().filter(row=>subscriptionCommissionStatus(row)==='received').reduce((sum,row)=>sum+subscriptionCommissionAmount(row),0);
  const received=ordinaryReceived+subscriptionReceived,revenue=ordinaryRevenue+subRevenue;
  openDetails('تفاصيل صافي الربح',`<div class="notice"><b>المحصل:</b> ${esc(money(revenue))}<br><b>المصروفات:</b> ${esc(money(cost))}<br><b>العمولات المستلمة:</b> ${esc(money(received))}<br><b>الصافي التقريبي:</b> ${esc(money(revenue-cost-received))}</div>`);
}
function makeClickable(id,handler,title){
  const el=document.getElementById(id);if(!el||el.dataset.professionalClickable)return;
  const card=el.closest('.finance-card,.stat')||el;card.classList.add('professional-clickable');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',title);el.dataset.professionalClickable='1';card.addEventListener('click',handler);card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();handler()}});
}
function enhanceFinance(){
  makeClickable('finRevenue',showRevenue,'فتح تفاصيل الإيرادات');makeClickable('finExpenses',showExpenses,'فتح تفاصيل المصروفات');makeClickable('finProfit',showProfit,'فتح تفاصيل صافي الربح');makeClickable('finDue',showDue,'فتح تفاصيل المبالغ المتبقية');makeClickable('finCommissionOutstanding',()=>showCommission('outstanding'),'فتح متابعة عمولات المدير');makeClickable('finCommissionReceived',()=>showCommission('received'),'فتح تفاصيل العمولات المستلمة');makeClickable('commissionTotal',()=>showCommission('outstanding'),'فتح متابعة عمولات المدير');
  document.getElementById('expenseAverage')?.closest('.stat')?.classList.add('professional-secondary-stat');
}
function sortCustomerCards(){
  const root=document.getElementById('customerList');if(!root||root.children.length<2)return;
  const start=new Date();start.setHours(0,0,0,0);
  const score=card=>{const heading=norm(card.querySelector('h4')?.textContent||''),matches=bookings().filter(b=>heading.includes(norm(b.name))&&b.status!=='ملغي'),future=matches.map(b=>String(b.date||'')).filter(d=>d&&new Date(`${d}T00:00:00`)>=start).sort();return future.length?new Date(`${future[0]}T00:00:00`).getTime():Number.MAX_SAFE_INTEGER};
  [...root.children].sort((a,b)=>score(a)-score(b)).forEach(node=>root.appendChild(node));
}
function refreshView(){scopeAddBooking();cleanVoiceUi();clarifyBookingActions();if(activeViewId()==='expenses'){setFinanceAllPeriods();enhanceFinance()}if(activeViewId()==='customers')sortCustomerCards()}
function initialize(){
  if(!document.querySelector('link[data-professional-ui-stable]')){const style=document.createElement('link');style.rel='stylesheet';style.href='professional-ui-cleanup.css?v=20260813-1';style.dataset.professionalUiStable='1';document.head.appendChild(style)}
  refreshView();setTimeout(refreshView,500);
  document.addEventListener('click',event=>{if(event.target?.closest?.('nav button,.simple-more-item,#bookingModal button'))setTimeout(refreshView,40)},true);
  document.addEventListener('change',event=>{if(event.target?.id==='financePeriod')setTimeout(refreshView,0)},true);
  window.addEventListener('adwaa-subscription-updated',()=>setTimeout(refreshView,0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
