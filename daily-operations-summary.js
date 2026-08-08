(()=>{
'use strict';
if(window.__adwaaDailyOperationsSummaryInstalled)return;
window.__adwaaDailyOperationsSummaryInstalled=true;
const KEY='adwaaDailyOpsSummarySeen';
const state=()=>window.db||{};
const bookings=()=>Array.isArray(state().bookings)?state().bookings:[];
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const money=v=>typeof window.money==='function'?window.money(v):`${Math.max(0,Number(v||0)).toLocaleString('ar-SA')} ر.س`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function nav(label){const btn=[...document.querySelectorAll('nav button')].find(b=>String(b.textContent||'').includes(label));btn?.click()}
function dueItems(){const date=today(),rows=bookings().filter(b=>b.status!=='ملغي'&&b.recordType!=='family'),todayRows=rows.filter(b=>b.date===date),entryPending=todayRows.filter(b=>!['تم الدخول','تم الخروج'].includes(b.status)),exitPending=todayRows.filter(b=>b.status==='تم الدخول'),dueMoney=rows.filter(b=>Number(b.total||0)>Number(b.paid||0)),commissions=rows.filter(b=>b.commissionSnapshot?.status==='earned');return {todayRows,entryPending,exitPending,dueMoney,commissions}}
function ensureModal(){if(document.getElementById('dailyOpsSummaryModal'))return;const modal=document.createElement('div');modal.id='dailyOpsSummaryModal';modal.className='modal';modal.innerHTML='<div class="sheet" style="max-width:620px;margin:auto"><div class="sheet-head"><h2>متابعة اليوم</h2><button class="close" type="button">×</button></div><div id="dailyOpsSummaryBody"></div><div class="actions"><button class="primary" data-bookings>فتح الحجوزات</button><button class="secondary" data-close>إغلاق</button></div></div>';modal.querySelector('.close').onclick=()=>modal.classList.remove('open');modal.querySelector('[data-close]').onclick=()=>modal.classList.remove('open');modal.querySelector('[data-bookings]').onclick=()=>{modal.classList.remove('open');nav('الحجوزات')};document.body.appendChild(modal)}
function show(){const items=dueItems();if(!items.todayRows.length&&!items.dueMoney.length&&!items.commissions.length)return;ensureModal();const lines=[];if(items.todayRows.length)lines.push(`<div class="notice"><b>حجوزات اليوم:</b> ${items.todayRows.length}<br>بانتظار تأكيد الدخول: ${items.entryPending.length}<br>بانتظار متابعة الخروج: ${items.exitPending.length}</div>`);if(items.dueMoney.length)lines.push(`<div class="notice">💰 <b>${items.dueMoney.length}</b> حجز عليه مبلغ متبقٍ. إجمالي المتبقي التقريبي: <b>${esc(money(items.dueMoney.reduce((s,b)=>s+Math.max(0,Number(b.total||0)-Number(b.paid||0)),0)))}</b></div>`);if(items.commissions.length)lines.push(`<div class="notice">💼 لديك <b>${items.commissions.length}</b> عمولة مدير مستحقة بانتظار تأكيد التحويل.</div>`);document.getElementById('dailyOpsSummaryBody').innerHTML=lines.join('');document.getElementById('dailyOpsSummaryModal').classList.add('open');localStorage.setItem(KEY,today())}
function maybeShow(){const d=new Date();if(d.getHours()<12)return;if(localStorage.getItem(KEY)===today())return;setTimeout(show,700)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',maybeShow,{once:true});else maybeShow();
window.addEventListener('focus',maybeShow);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybeShow()});
})();
