(()=>{
'use strict';
if(window.__adwaaProfessionalUiCleanupInstalled)return;
window.__adwaaProfessionalUiCleanupInstalled=true;

const state=()=>window.db||{};
const bookings=()=>Array.isArray(state().bookings)?state().bookings:[];
const expenses=()=>Array.isArray(state().expenses)?state().expenses:[];
const money=value=>typeof window.money==='function'?window.money(value):`${Math.max(0,Number(value||0)).toLocaleString('ar-SA')} ر.س`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=value=>String(value||'').replace(/\s+/g,' ').trim();

function activeViewId(){return document.querySelector('.view.active')?.id||''}
function inBookings(){return activeViewId()==='bookings'}

function cleanVoiceUi(){
  document.querySelectorAll('.voice,[onclick*="startVoice"],[onclick*="parseVoice"]').forEach(el=>el.remove());
  document.querySelectorAll('button,a,.notice,.section-head').forEach(el=>{
    const text=norm(el.textContent);
    if(/أمر صوتي|أوامر صوتية|إدخال صوتي|تسجيل صوتي/.test(text)&&el.closest('#bookingModal'))el.remove();
  });
}

function scopeAddBooking(){
  const headerButton=document.querySelector('header .icon-btn');
  if(headerButton){
    headerButton.style.display=inBookings()?'':'none';
    headerButton.setAttribute('aria-hidden',inBookings()?'false':'true');
  }
  document.querySelectorAll('[data-action="booking"]').forEach(el=>el.remove());
  const homeActions=document.querySelector('.simple-home-actions');
  if(homeActions&&homeActions.children.length===0)homeActions.remove();
}

function clarifyBookingActions(){
  document.querySelectorAll('#bookingModal button').forEach(button=>{
    const text=norm(button.textContent);
    if(text==='تحديث البيانات'||text==='تحديث')button.textContent='حفظ التعديلات';
    if(text==='رجوع للحجز')button.textContent='رجوع بدون حفظ';
  });
}

function setFinanceAllPeriods(){
  const select=document.getElementById('financePeriod');if(!select)return;
  if(![...select.options].some(o=>o.value==='all')){
    const option=document.createElement('option');option.value='all';option.textContent='كل الفترات';select.insertBefore(option,select.firstChild);
  }
  if(!select.dataset.defaultAllApplied){select.dataset.defaultAllApplied='1';select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}))}
}

function commissionStatus(row){
  if(row?.recordType==='family')return 'no_commission';
  const snap=row?.commissionSnapshot||{};
  if(row?.commissionReceivedBeforeSystem||['received_before_system','legacy_received','received_pre_system'].includes(String(snap.status||'')))return 'received_before_system';
  if(snap.status==='received'||snap.received||snap.receivedAt||row?.commissionReceivedAt)return 'received';
  if(snap.status==='no_commission'||row?.status==='ملغي')return 'no_commission';
  if(snap.status==='earned')return 'earned';
  return 'not_earned';
}
function commissionAmount(row){return Math.max(0,Number(row?.commissionSnapshot?.amount||0))}
function isFullyPaid(row){return Number(row?.total||0)>0&&Number(row?.paid||0)>=Number(row?.total||0)}
function periodValue(){return document.getElementById('financePeriod')?.value||'all'}
function dateMatch(value,period=periodValue()){
  if(period==='all')return true;
  const date=String(value||'').slice(0,10),today=new Date(),todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if(period==='today')return date===todayIso;
  if(period==='month')return date.slice(0,7)===todayIso.slice(0,7);
  if(period==='year')return date.slice(0,4)===todayIso.slice(0,4);
  return true;
}
function periodBookings(){return bookings().filter(row=>row.status!=='ملغي'&&dateMatch(row.date))}

function ensureDetailModal(){
  if(document.getElementById('professionalFinanceModal'))return;
  const modal=document.createElement('div');modal.id='professionalFinanceModal';modal.className='modal';
  modal.innerHTML='<div class="sheet" style="max-width:760px;margin:auto"><div class="sheet-head"><h2 id="professionalFinanceTitle">التفاصيل</h2><button class="close" type="button" data-close>×</button></div><div id="professionalFinanceBody"></div></div>';
  modal.querySelector('[data-close]').onclick=()=>modal.classList.remove('open');
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});document.body.appendChild(modal);
}
function openDetails(title,html){ensureDetailModal();document.getElementById('professionalFinanceTitle').textContent=title;document.getElementById('professionalFinanceBody').innerHTML=html;document.getElementById('professionalFinanceModal').classList.add('open')}
function detailList(rows,empty='لا توجد بيانات في الفترة المحددة'){return rows.length?`<div class="list">${rows.join('')}</div>`:`<div class="empty">${empty}</div>`}
function bookingRow(row,extra=''){
  const due=Math.max(0,Number(row.total||0)-Number(row.paid||0));
  return `<div class="item"><div><h4>${esc(row.name||'بدون اسم')} <span class="small">#${esc(row.code||'')}</span></h4><div class="meta">${esc(row.date||'')} • ${esc(row.type||'')}<br>الإجمالي ${esc(money(row.total))} • المدفوع ${esc(money(row.paid))} • المتبقي ${esc(money(due))}${extra?`<br>${extra}`:''}</div></div></div>`;
}
function expenseRow(row){return `<div class="item"><div><h4>${esc(row.title||row.cat||'مصروف')}</h4><div class="meta">${esc(row.date||'')} • ${esc(row.cat||'غير مصنف')} • ${esc(row.paymentMethod||'طريقة غير محددة')}<br>${row.notes?esc(row.notes):''}</div></div><b>${esc(money(row.amount))}</b></div>`}

function showRevenue(){const rows=periodBookings().filter(r=>Number(r.paid||0)>0);openDetails('تفاصيل الإيرادات',detailList(rows.map(r=>bookingRow(r))))}
function showDue(){const rows=periodBookings().filter(r=>Number(r.total||0)>Number(r.paid||0));openDetails('المبالغ المتبقية',detailList(rows.map(r=>bookingRow(r,'⚠️ يوجد مبلغ لم يُستلم بعد'))))}
function showExpenses(){const rows=expenses().filter(r=>dateMatch(r.date));openDetails('تفاصيل المصروفات',detailList(rows.map(expenseRow),'لا توجد مصروفات في الفترة المحددة'))}
function showCommission(mode){
  const rows=bookings().filter(r=>dateMatch(r.date)&&r.commissionSnapshot);
  const selected=mode==='received'?rows.filter(r=>commissionStatus(r)==='received'):rows.filter(r=>commissionStatus(r)==='earned');
  const html=selected.map(r=>{
    const paid=isFullyPaid(r),label=mode==='received'?'✅ تم تأكيد استلام العمولة':paid?'🟠 العمولة مستحقة ولم تؤكد تحويلها':'🟡 العميل دفع عربون/جزئي ولم يكتمل السداد';
    return bookingRow(r,`${label} • قيمة العمولة ${esc(money(commissionAmount(r)))}`)
  });
  openDetails(mode==='received'?'العمولات المستلمة':'عمولات المدير المستحقة',detailList(html,mode==='received'?'لا توجد عمولات مستلمة في الفترة المحددة':'لا توجد عمولات مستحقة في الفترة المحددة'));
}
function showProfit(){
  const rows=periodBookings(),revenue=rows.reduce((s,r)=>s+Number(r.paid||0),0),cost=expenses().filter(r=>dateMatch(r.date)).reduce((s,r)=>s+Number(r.amount||0),0),received=bookings().filter(r=>dateMatch(r.date)&&commissionStatus(r)==='received').reduce((s,r)=>s+commissionAmount(r),0);
  openDetails('تفاصيل صافي الربح',`<div class="notice"><b>المحصل:</b> ${esc(money(revenue))}<br><b>المصروفات:</b> ${esc(money(cost))}<br><b>العمولات المستلمة:</b> ${esc(money(received))}<br><b>الصافي التقريبي:</b> ${esc(money(revenue-cost-received))}</div>`)
}

function makeClickable(id,handler,title){const el=document.getElementById(id);if(!el||el.dataset.professionalClickable)return;const card=el.closest('.finance-card,.stat')||el;card.classList.add('professional-clickable');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',title);card.dataset.professionalClickable='1';card.addEventListener('click',handler);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handler()}})}
function enhanceFinance(){
  makeClickable('finRevenue',showRevenue,'فتح تفاصيل الإيرادات');
  makeClickable('finExpenses',showExpenses,'فتح تفاصيل المصروفات');
  makeClickable('finProfit',showProfit,'فتح تفاصيل صافي الربح');
  makeClickable('finDue',showDue,'فتح تفاصيل المبالغ المتبقية');
  makeClickable('finCommissionOutstanding',()=>showCommission('outstanding'),'فتح تفاصيل عمولات المدير المستحقة');
  makeClickable('finCommissionReceived',()=>showCommission('received'),'فتح تفاصيل العمولات المستلمة');
  makeClickable('commissionTotal',()=>showCommission('outstanding'),'فتح تفاصيل عمولات المدير المستحقة');
  const average=document.getElementById('expenseAverage')?.closest('.stat');if(average)average.classList.add('professional-secondary-stat');
}

function sortCustomerCards(){
  const root=document.getElementById('customerList');if(!root||root.children.length<2)return;
  const today=new Date();today.setHours(0,0,0,0);
  const score=card=>{
    const name=norm(card.querySelector('h4')?.textContent||card.textContent).replace(/#.*$/,'').trim();
    const matches=bookings().filter(b=>norm(b.name)===name&&b.status!=='ملغي');
    const future=matches.map(b=>String(b.date||'')).filter(Boolean).filter(d=>new Date(`${d}T00:00:00`)>=today).sort();
    if(future.length)return new Date(`${future[0]}T00:00:00`).getTime();
    const all=matches.map(b=>String(b.date||'')).filter(Boolean).sort().reverse();
    return all.length?9e15-new Date(`${all[0]}T00:00:00`).getTime():Number.MAX_SAFE_INTEGER;
  };
  [...root.children].sort((a,b)=>score(a)-score(b)).forEach(node=>root.appendChild(node));
}

function watchView(){scopeAddBooking();cleanVoiceUi();clarifyBookingActions();if(activeViewId()==='expenses'){setFinanceAllPeriods();enhanceFinance()}if(activeViewId()==='customers')sortCustomerCards()}
function initialize(){
  const style=document.createElement('link');style.rel='stylesheet';style.href='professional-ui-cleanup.css?v=20260808-1';document.head.appendChild(style);
  watchView();
  new MutationObserver(()=>setTimeout(watchView,0)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',()=>setTimeout(watchView,30),true);
  setInterval(watchView,2500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
