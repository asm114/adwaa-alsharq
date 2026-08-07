(()=>{
'use strict';
if(window.__adwaaBookingsExcelExportInstalled)return;
window.__adwaaBookingsExcelExportInstalled=true;

const norm=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=v=>Number(v||0)||0;
const xml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

function appDb(){try{if(typeof db!=='undefined'&&db)return db;return JSON.parse(localStorage.getItem('adwaaDB')||'{}')||{}}catch(_){return {}}}
function bookings(){return (Array.isArray(appDb().bookings)?appDb().bookings:[]).filter(b=>b?.recordType!=='family')}
function isCancelled(b){return /ملغي|cancel/i.test(norm(b.status??b.bookingStatus))}
function dateValue(b){return b.date??b.checkIn??b.checkin??b.startDate??b.bookingDate??b.arrivalDate??''}
function dateObj(b){const d=new Date(dateValue(b));return Number.isNaN(d.getTime())?null:d}
function endValue(b){return b.checkOut??b.checkout??b.endDate??b.departureDate??''}
function history(b){return [b.paymentHistory,b.payments,b.paymentEntries,b.receipts,b.installments].find(Array.isArray)||[]}
function totalOf(b){return num(b.total??b.amount??b.bookingTotal??b.totalAmount)}
function paidOf(b){
  try{if(typeof getPaymentStatus==='function'){const p=getPaymentStatus(b);const x=Number(p?.paid??p?.received??p?.collected);if(Number.isFinite(x))return x}}catch(_){}
  if(Number.isFinite(Number(b.paidAmount)))return num(b.paidAmount);
  if(Number.isFinite(Number(b.paid)))return num(b.paid);
  const h=history(b);if(h.length)return h.reduce((s,p)=>s+num(p.amount??p.value??p.paid),0);
  return num(b.deposit??b.received??b.amountPaid);
}
function dueOf(b){return Math.max(0,totalOf(b)-paidOf(b))}
function customer(b){return norm(b.name??b.customerName??b.clientName)||'بدون اسم'}
function phone(b){return norm(b.phone??b.mobile??b.customerPhone)||''}
function code(b){return norm(b.code??b.bookingCode??b.id)||''}
function type(b){return norm(b.type??b.bookingType)||''}
function status(b){return norm(b.status??b.bookingStatus)||''}
function notes(b){return norm(b.notes??b.note??b.bookingNotes)||''}
function stayDays(b){return num(b.stayDays??b.nights??b.days)||1}
function payStatus(b){const t=totalOf(b),p=paidOf(b),d=dueOf(b);if(t<=0)return 'بدون مبلغ';if(d<=0)return 'مدفوع بالكامل';if(p>0)return 'مدفوع جزئيًا';return 'غير مدفوع'}
function fmtDate(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('ar-SA')}
function fmtDateTime(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('ar-SA')}

function choose(mode){
  const all=bookings().slice(),now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(mode==='month')return all.filter(b=>{const d=dateObj(b);return d&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()});
  if(mode==='upcoming')return all.filter(b=>{const d=dateObj(b);return d&&d>=today&&!isCancelled(b)});
  if(mode==='due')return all.filter(b=>dueOf(b)>0&&!isCancelled(b));
  return all;
}
function title(mode){return ({all:'جميع الحجوزات',month:'حجوزات هذا الشهر',upcoming:'الحجوزات القادمة',due:'الحجوزات ذات المبالغ المتبقية'})[mode]||'الحجوزات'}

function cell(value,type='String',style='Body'){
  const v=value==null?'':value;
  return `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${xml(v)}</Data></Cell>`;
}
function row(values,header=false){return `<Row>${values.map(v=>cell(v,typeof v==='number'?'Number':'String',header?'Header':'Body')).join('')}</Row>`}
function moneyCell(v){return `<Cell ss:StyleID="Money"><Data ss:Type="Number">${num(v)}</Data></Cell>`}
function summaryRow(label,value,money=false){return `<Row>${cell(label,'String','SummaryLabel')}${money?moneyCell(value):cell(value,typeof value==='number'?'Number':'String','SummaryValue')}</Row>`}

function workbookXml(rows,mode){
  const totals=rows.reduce((s,b)=>{s.total+=totalOf(b);s.paid+=paidOf(b);s.due+=dueOf(b);return s},{total:0,paid:0,due:0});
  const bookingHeaders=['رقم الحجز','اسم العميل','الجوال','نوع الحجز','الحالة','تاريخ الدخول','تاريخ الخروج','عدد الأيام','الإجمالي','المدفوع','المتبقي','حالة السداد','الملاحظات'];
  const bookingRows=rows.map(b=>`<Row>${cell(code(b))}${cell(customer(b))}${cell(phone(b))}${cell(type(b))}${cell(status(b))}${cell(fmtDate(dateValue(b)))}${cell(fmtDate(endValue(b)))}${cell(stayDays(b),'Number')}${moneyCell(totalOf(b))}${moneyCell(paidOf(b))}${moneyCell(dueOf(b))}${cell(payStatus(b))}${cell(notes(b))}</Row>`).join('');
  const paymentHeaders=['رقم الحجز','اسم العميل','تاريخ الدفعة','المبلغ','طريقة الدفع','الملاحظة'];
  const paymentRows=rows.flatMap(b=>history(b).map(p=>`<Row>${cell(code(b))}${cell(customer(b))}${cell(fmtDateTime(p.date??p.createdAt??p.created_at??p.at))}${moneyCell(p.amount??p.value??p.paid)}${cell(norm(p.method??p.paymentMethod??p.type))}${cell(norm(p.note??p.notes))}</Row>`)).join('');
  const generated=new Date().toLocaleString('ar-SA');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
 <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="11"/></Style>
 <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#5F50D9" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
 <Style ss:ID="Body"><Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E6E6E6"/></Borders></Style>
 <Style ss:ID="Money"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0 [$ر.س-401]"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E6E6E6"/></Borders></Style>
 <Style ss:ID="Title"><Alignment ss:Horizontal="Center"/><Font ss:Bold="1" ss:Size="16" ss:Color="#FFFFFF"/><Interior ss:Color="#0F7866" ss:Pattern="Solid"/></Style>
 <Style ss:ID="SummaryLabel"><Font ss:Bold="1"/><Interior ss:Color="#F3F1FF" ss:Pattern="Solid"/></Style>
 <Style ss:ID="SummaryValue"><Font ss:Bold="1"/></Style>
</Styles>
<Worksheet ss:Name="الملخص"><Table>
 <Column ss:Width="190"/><Column ss:Width="150"/>
 <Row ss:Height="28"><Cell ss:MergeAcross="1" ss:StyleID="Title"><Data ss:Type="String">منتجع أضواء الشرق — تقرير ${xml(title(mode))}</Data></Cell></Row>
 ${summaryRow('تاريخ التصدير',generated)}${summaryRow('عدد الحجوزات',rows.length)}${summaryRow('إجمالي قيمة الحجوزات',totals.total,true)}${summaryRow('إجمالي المحصل',totals.paid,true)}${summaryRow('إجمالي المتبقي',totals.due,true)}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>
<Worksheet ss:Name="الحجوزات"><Table>
 <Column ss:Width="95"/><Column ss:Width="145"/><Column ss:Width="95"/><Column ss:Width="85"/><Column ss:Width="85"/><Column ss:Width="95"/><Column ss:Width="95"/><Column ss:Width="70"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="105"/><Column ss:Width="220"/>
 ${row(bookingHeaders,true)}${bookingRows}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><FilterOn/></WorksheetOptions></Worksheet>
<Worksheet ss:Name="الدفعات"><Table>
 <Column ss:Width="95"/><Column ss:Width="145"/><Column ss:Width="135"/><Column ss:Width="90"/><Column ss:Width="100"/><Column ss:Width="220"/>
 ${row(paymentHeaders,true)}${paymentRows||row(['لا توجد دفعات مسجلة','','','','',''])}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>
</Workbook>`;
}

function exportExcel(mode){
  const rows=choose(mode).sort((a,b)=>(dateObj(a)?.getTime()||0)-(dateObj(b)?.getTime()||0));
  if(!rows.length){alert('لا توجد حجوزات ضمن الاختيار الحالي.');return;}
  const content=workbookXml(rows,mode);
  const blob=new Blob(['\ufeff',content],{type:'application/vnd.ms-excel;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  const stamp=new Date().toISOString().slice(0,10);
  a.href=url;a.download=`Adwaa-AlSharq-Bookings-${mode}-${stamp}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function chooser(){
  let root=document.getElementById('bookingsExcelChooser');if(root)return root;
  root=document.createElement('div');root.id='bookingsExcelChooser';root.className='bexcel-overlay';root.innerHTML=`<section class="bexcel-sheet" role="dialog" aria-modal="true"><div class="bexcel-head"><div><small>تصدير Excel</small><h3>وش تبي تصدّر؟</h3></div><button type="button" data-close>×</button></div><div class="bexcel-options"><button type="button" data-mode="all"><b>كل الحجوزات</b><span>ملف كامل بكل الحجوزات</span></button><button type="button" data-mode="month"><b>هذا الشهر</b><span>حجوزات الشهر الحالي فقط</span></button><button type="button" data-mode="upcoming"><b>الحجوزات القادمة</b><span>القادمة وغير الملغاة</span></button><button type="button" data-mode="due"><b>عليها متبقي</b><span>الحجوزات غير مكتملة السداد</span></button></div></section>`;
  document.body.appendChild(root);
  const style=document.createElement('style');style.textContent=`.bexcel-overlay{position:fixed;inset:0;background:#1c243044;z-index:180;display:none;align-items:flex-end;justify-content:center;padding:12px}.bexcel-overlay.open{display:flex}.bexcel-sheet{width:min(560px,100%);background:#fff;border-radius:24px;padding:16px;box-shadow:0 25px 80px #0002}.bexcel-head{display:flex;justify-content:space-between;gap:12px}.bexcel-head h3{margin:3px 0 12px}.bexcel-head small{color:#6754df;font-weight:900}.bexcel-head [data-close]{border:0;background:#f1effb;width:40px;height:40px;border-radius:12px;font-size:22px}.bexcel-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bexcel-options button{border:1px solid #e4e3ed;background:#fff;border-radius:15px;padding:13px;text-align:right;color:#202636}.bexcel-options b{display:block;margin-bottom:4px;color:#0f7866}.bexcel-options span{font-size:12px;color:#7e8592;line-height:1.5}.bookings-excel-btn{white-space:nowrap}@media(max-width:560px){.bexcel-options{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-close]'))root.classList.remove('open')});
  root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{root.classList.remove('open');exportExcel(btn.dataset.mode)}));
  return root;
}
function installButton(){
  if(document.getElementById('bookingsExcelExportBtn'))return true;
  const view=document.getElementById('bookings')||document.querySelector('.view[data-view="bookings"],#bookingsView');if(!view)return false;
  const add=[...view.querySelectorAll('button')].find(b=>/حجز جديد|إضافة حجز/.test(norm(b.textContent)));
  const btn=document.createElement('button');btn.id='bookingsExcelExportBtn';btn.type='button';btn.className='bookings-excel-btn';btn.textContent='📊 تصدير Excel';btn.addEventListener('click',()=>chooser().classList.add('open'));
  if(add?.parentElement){add.parentElement.insertBefore(btn,add.nextSibling)}else view.prepend(btn);
  return true;
}
function init(){if(installButton())return;const mo=new MutationObserver(()=>{if(installButton())mo.disconnect()});mo.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
