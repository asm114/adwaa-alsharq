(()=>{
'use strict';
if(window.__adwaaBookingsPdfReportInstalled)return;
window.__adwaaBookingsPdfReportInstalled=true;

const norm=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=v=>Number(v||0)||0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>`${num(v).toLocaleString('ar-SA')} ر.س`;

function appDb(){
  try{
    if(typeof db!=='undefined'&&db)return db;
    return JSON.parse(localStorage.getItem('adwaaDB')||'{}')||{};
  }catch(_){return {}}
}
function bookings(){return (Array.isArray(appDb().bookings)?appDb().bookings:[]).filter(b=>b?.recordType!=='family')}
function isCancelled(b){return /ملغي|cancel/i.test(norm(b.status??b.bookingStatus))}
function bookingDateValue(b){return b.date??b.checkIn??b.checkin??b.startDate??b.bookingDate??b.arrivalDate??''}
function bookingDate(b){const d=new Date(bookingDateValue(b));return Number.isNaN(d.getTime())?null:d}
function bookingEnd(b){return b.checkOut??b.checkout??b.endDate??b.departureDate??''}
function totalOf(b){return num(b.total??b.amount??b.bookingTotal??b.totalAmount)}
function paidOf(b){
  try{
    if(typeof getPaymentStatus==='function'){
      const p=getPaymentStatus(b);const paid=Number(p?.paid??p?.received??p?.collected);
      if(Number.isFinite(paid))return paid;
    }
  }catch(_){ }
  if(Number.isFinite(Number(b.paidAmount)))return num(b.paidAmount);
  if(Number.isFinite(Number(b.paid)))return num(b.paid);
  const history=paymentHistory(b);
  if(history.length)return history.reduce((s,p)=>s+num(p.amount??p.value??p.paid),0);
  return num(b.deposit??b.received??b.amountPaid);
}
function dueOf(b){return Math.max(0,totalOf(b)-paidOf(b))}
function paymentHistory(b){
  const candidates=[b.paymentHistory,b.payments,b.paymentEntries,b.receipts,b.installments];
  return candidates.find(Array.isArray)||[];
}
function fmtDate(value){
  if(!value)return '—';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return esc(value);
  return d.toLocaleDateString('ar-SA',{year:'numeric',month:'2-digit',day:'2-digit'});
}
function fmtDateTime(value){
  if(!value)return '—';const d=new Date(value);if(Number.isNaN(d.getTime()))return esc(value);
  return d.toLocaleString('ar-SA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function customerName(b){return norm(b.name??b.customerName??b.clientName)||'بدون اسم'}
function phone(b){return norm(b.phone??b.mobile??b.customerPhone)||'—'}
function code(b){return norm(b.code??b.bookingCode??b.id)||'—'}
function status(b){return norm(b.status??b.bookingStatus)||'—'}
function type(b){return norm(b.type??b.bookingType)||'—'}
function note(b){return norm(b.notes??b.note??b.bookingNotes)||'—'}
function stayDays(b){return num(b.stayDays??b.nights??b.days)||1}

function chooseRows(mode){
  const all=bookings().slice();const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(mode==='month')return all.filter(b=>{const d=bookingDate(b);return d&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()});
  if(mode==='upcoming')return all.filter(b=>{const d=bookingDate(b);return d&&d>=today&&!isCancelled(b)});
  if(mode==='due')return all.filter(b=>dueOf(b)>0&&!isCancelled(b));
  return all;
}
function reportTitle(mode){return ({all:'تقرير جميع الحجوزات',month:'تقرير حجوزات هذا الشهر',upcoming:'تقرير الحجوزات القادمة',due:'تقرير الحجوزات ذات المبالغ المتبقية'})[mode]||'تقرير الحجوزات'}

function paymentRows(b){
  const rows=paymentHistory(b);if(!rows.length)return '';
  return `<div class="payments"><b>سجل الدفعات</b><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظة</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${fmtDateTime(p.date??p.createdAt??p.created_at??p.at)}</td><td>${money(p.amount??p.value??p.paid)}</td><td>${esc(norm(p.method??p.paymentMethod??p.type)||'—')}</td><td>${esc(norm(p.note??p.notes)||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function bookingCard(b,index){
  const paid=paidOf(b),due=dueOf(b),total=totalOf(b);
  return `<article class="booking-card">
    <div class="booking-head"><div><span class="idx">${index+1}</span><strong>${esc(customerName(b))}</strong><small>${esc(code(b))}</small></div><span class="status">${esc(status(b))}</span></div>
    <div class="details-grid">
      <div><span>الجوال</span><b>${esc(phone(b))}</b></div>
      <div><span>نوع الحجز</span><b>${esc(type(b))}</b></div>
      <div><span>تاريخ الدخول</span><b>${fmtDate(bookingDateValue(b))}</b></div>
      <div><span>الخروج</span><b>${bookingEnd(b)?fmtDate(bookingEnd(b)):esc(type(b)==='مبيت'?`${stayDays(b)} يوم`:'نفس اليوم')}</b></div>
      <div><span>الإجمالي</span><b>${money(total)}</b></div>
      <div><span>المدفوع</span><b>${money(paid)}</b></div>
      <div><span>المتبقي</span><b class="${due>0?'due':''}">${money(due)}</b></div>
      <div><span>حالة السداد</span><b>${due<=0&&total>0?'مدفوع بالكامل':due>0?'متبقي مبلغ':'—'}</b></div>
    </div>
    <div class="notes"><span>الملاحظات</span><p>${esc(note(b))}</p></div>
    ${paymentRows(b)}
  </article>`;
}

function buildReport(mode){
  const rows=chooseRows(mode).sort((a,b)=>(bookingDate(a)?.getTime()||0)-(bookingDate(b)?.getTime()||0));
  if(!rows.length){alert('لا توجد حجوزات ضمن الاختيار الحالي.');return;}
  const totals=rows.reduce((s,b)=>{s.total+=totalOf(b);s.paid+=paidOf(b);s.due+=dueOf(b);return s},{total:0,paid:0,due:0});
  const w=window.open('','_blank');if(!w){alert('المتصفح منع فتح تقرير PDF. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.');return;}
  const title=reportTitle(mode);
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — منتجع أضواء الشرق</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f5f4;color:#17231f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}.toolbar{position:sticky;top:0;z-index:20;display:flex;gap:8px;flex-wrap:wrap;padding:12px;background:#fff;border-bottom:1px solid #dfe5e2}.toolbar button{border:0;border-radius:12px;padding:11px 15px;font:800 14px inherit;cursor:pointer}.back{background:#fff;color:#0f7866;border:1px solid #a8c9c0!important}.print{background:#0f7866;color:#fff}.report{width:min(1100px,calc(100% - 24px));margin:18px auto 50px}.report-head{background:#fff;border:1px solid #dfe5e2;border-radius:20px;padding:22px;margin-bottom:14px}.eyebrow{color:#6d59dc;font-weight:900}.report-head h1{margin:6px 0 7px;font-size:26px}.muted{color:#78847f}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:16px}.summary>div{border:1px solid #e1e6e3;border-radius:14px;padding:12px}.summary span,.details-grid span,.notes span{display:block;color:#7d8883;font-size:12px;margin-bottom:4px}.summary b{font-size:18px}.booking-card{background:#fff;border:1px solid #dfe5e2;border-radius:18px;padding:17px;margin-bottom:12px;break-inside:avoid}.booking-head{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #edf0ee;padding-bottom:10px;margin-bottom:12px}.booking-head>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.idx{background:#eeeafd;color:#6551d8;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900}.booking-head strong{font-size:18px}.booking-head small{color:#78847f}.status{background:#e8f5f0;color:#14745d;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900}.details-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.details-grid>div{border:1px solid #edf0ee;border-radius:12px;padding:10px;min-width:0}.details-grid b{overflow-wrap:anywhere}.due{color:#a66c00}.notes{margin-top:10px;border:1px solid #edf0ee;border-radius:12px;padding:10px}.notes p{margin:0;white-space:pre-wrap;line-height:1.7}.payments{margin-top:10px}.payments>b{display:block;margin-bottom:7px}.payments table{width:100%;border-collapse:collapse;font-size:12px}.payments th,.payments td{border:1px solid #e4e9e6;padding:7px;text-align:right}.payments th{background:#f5f7f6}.footer{text-align:center;color:#7d8883;font-size:12px;margin-top:18px;padding:12px}@media(max-width:700px){.summary,.details-grid{grid-template-columns:repeat(2,1fr)}}@page{size:A4;margin:12mm}@media print{body{background:#fff}.toolbar{display:none!important}.report{width:100%;margin:0}.report-head,.booking-card{box-shadow:none}.booking-card{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body><div class="toolbar"><button class="back" onclick="window.close()">← رجوع للنظام</button><button class="print" onclick="window.print()">طباعة / حفظ PDF</button></div><main class="report"><section class="report-head"><div class="eyebrow">منتجع أضواء الشرق</div><h1>${esc(title)}</h1><div class="muted">تاريخ الإصدار: ${new Date().toLocaleString('ar-SA')}</div><div class="summary"><div><span>عدد الحجوزات</span><b>${rows.length}</b></div><div><span>إجمالي قيمة الحجوزات</span><b>${money(totals.total)}</b></div><div><span>إجمالي المحصل</span><b>${money(totals.paid)}</b></div><div><span>إجمالي المتبقي</span><b>${money(totals.due)}</b></div></div></section>${rows.map(bookingCard).join('')}<div class="footer">تم إنشاء التقرير من نظام إدارة منتجع أضواء الشرق.</div></main></body></html>`;
  w.document.open();w.document.write(html);w.document.close();
}

function ensureChooser(){
  let root=document.getElementById('bookingsPdfChooser');if(root)return root;
  root=document.createElement('div');root.id='bookingsPdfChooser';root.className='bpdf-overlay';root.innerHTML=`<section class="bpdf-sheet" role="dialog" aria-modal="true"><div class="bpdf-head"><div><small>تقرير PDF</small><h3>وش تبي تصدّر؟</h3></div><button type="button" data-close>×</button></div><div class="bpdf-options"><button type="button" data-mode="all"><b>كل الحجوزات</b><span>تقرير كامل لجميع الحجوزات المسجلة</span></button><button type="button" data-mode="month"><b>هذا الشهر</b><span>حجوزات الشهر الحالي فقط</span></button><button type="button" data-mode="upcoming"><b>الحجوزات القادمة</b><span>الحجوزات القادمة وغير الملغاة</span></button><button type="button" data-mode="due"><b>عليها متبقي</b><span>الحجوزات التي لم يكتمل سدادها</span></button></div></section>`;
  document.body.appendChild(root);
  const style=document.createElement('style');style.id='bookingsPdfStyles';style.textContent=`.bpdf-overlay{position:fixed;inset:0;background:#1c243044;z-index:180;display:none;align-items:flex-end;justify-content:center;padding:12px}.bpdf-overlay.open{display:flex}.bpdf-sheet{width:min(560px,100%);background:#fff;border-radius:24px;padding:16px;box-shadow:0 25px 80px #0002}.bpdf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.bpdf-head h3{margin:3px 0 12px}.bpdf-head small{color:#6754df;font-weight:900}.bpdf-head [data-close]{border:0;background:#f1effb;width:40px;height:40px;border-radius:12px;font-size:22px}.bpdf-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bpdf-options button{border:1px solid #e4e3ed;background:#fff;border-radius:15px;padding:13px;text-align:right;color:#202636}.bpdf-options button:active{background:#f8f7ff}.bpdf-options b{display:block;margin-bottom:4px;color:#5949c9}.bpdf-options span{font-size:12px;color:#7e8592;line-height:1.5}.bookings-pdf-btn{white-space:nowrap}@media(max-width:560px){.bpdf-options{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-close]'))root.classList.remove('open')});
  root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{root.classList.remove('open');buildReport(btn.dataset.mode)}));return root;
}

function installButton(){
  if(document.getElementById('bookingsPdfExportBtn'))return true;
  const list=document.getElementById('bookingList');if(!list)return false;
  const view=list.closest('.view')||list.parentElement;
  const target=view?.querySelector('.toolbar')||view?.querySelector('.section-head')||list.parentElement;
  if(!target)return false;
  const btn=document.createElement('button');btn.id='bookingsPdfExportBtn';btn.type='button';btn.className='secondary bookings-pdf-btn';btn.textContent='📄 تصدير PDF';btn.addEventListener('click',()=>ensureChooser().classList.add('open'));
  target.appendChild(btn);return true;
}
function init(){
  if(!installButton()){
    const mo=new MutationObserver(()=>{if(installButton())mo.disconnect()});mo.observe(document.body,{childList:true,subtree:true});setTimeout(()=>mo.disconnect(),10000);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();