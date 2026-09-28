// Browser-run integration scenarios against the in-memory adapter only.
(()=>{
const panel=document.createElement('details');panel.id='qaPanel';panel.style='position:fixed;top:4px;left:4px;z-index:99999;max-width:360px;background:#fff7db;border:1px solid #bc9838;padding:6px;font:12px system-ui';panel.innerHTML='<summary>اختبارات معزولة</summary><button id="qaRun">تشغيل السيناريوهات</button><button id="qaLayout">فحص عرض الصفحة</button><pre id="qaResult" style="white-space:pre-wrap;max-height:350px;overflow:auto"></pre>';document.body.append(panel);
const result=document.getElementById('qaResult'),pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(condition,message)=>{if(!condition)throw Error(message);result.textContent+='✓ '+message+'\n'};
function fill(id,value){const el=document.getElementById(id);if(!el)throw Error('missing '+id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
function submit(form){form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}
async function saveBookingThroughUI(){document.querySelector('button[type="submit"][form="bookingForm"]').click();await pause(1600)}
document.getElementById('qaLayout').onclick=()=>{
 const width=document.documentElement.clientWidth;
 const overflow=[...document.querySelectorAll('#appRoot main *')].filter(e=>e.getClientRects().length&&!e.closest('.calendar,.finance-table,.resort-account-ledger,.protection-table,.workspace-finance-nav')).filter(e=>{const r=e.getBoundingClientRect();return r.left< -2||r.right>width+2});
 result.textContent='عرض '+width+' / صفحة '+document.documentElement.scrollWidth+'\nخروج: '+overflow.slice(0,8).map(e=>e.id||e.className).join(', ');
};
document.getElementById('qaRun').onclick=async()=>{
 result.textContent='';document.getElementById('qaRun').disabled=true;
 try{
  check(db.bookings.length===0,'بيانات فارغة ومعزولة');
  openBooking();await pause(50);fill('bName','عميل اختبار معزول');fill('bPhone','0500000000');fill('bDate','2026-10-20');fill('bTotal','١٢٠٠');fill('bookingDepositAmount','٥٠٠');
  await saveBookingThroughUI();
  check(db.bookings.length===1&&db.bookings[0].total===1200&&db.bookings[0].paid===500,'حجز 1200 وعربون 500 بالأرقام العربية');
  openBooking(db.bookings[0].id);document.getElementById('bookingPaymentAddToggle').click();fill('paymentAmount','٢٠٠');document.getElementById('paymentSaveButton').click();await saveBookingThroughUI();
  check(db.bookings[0].paid===700,'دفعة إضافية 200');
  openBooking(db.bookings[0].id);fill('bNotes','تعديل تجريبي');await saveBookingThroughUI();check(db.bookings[0].notes==='تعديل تجريبي','تعديل الحجز');
  for(const id of ['customers','expenses','calendarView','dashboard','bookings','settings','about','dataProtection']){switchView(id);check(document.getElementById(id).classList.contains('active'),'تنقل '+id)}
  switchView('expenses');openExpense();fill('eTitle','مصروف اختبار');fill('eAmount','١٠٠');document.querySelector('#expenseModal button[type="submit"]').click();await pause(800);
  check(ResortAccountCore.currentBalance(db)===600,'رصيد 700 محصل ناقص 100 مصروف');
  openMaintenanceJob();let form=document.getElementById('maintenanceJobForm');form.elements.title.value='صيانة اختبار';form.elements.vendor.value='فني تجريبي';form.elements.total.value='1200';QA.delay=100;submit(form);submit(form);await pause(450);
  check(db.maintenanceJobs.length===1,'الضغط مرتين لا يكرر الصيانة');
  openMaintenancePayment(db.maintenanceJobs[0].id);form=document.getElementById('maintenancePaymentForm');form.elements.amount.value='700';QA.fail=true;submit(form);await pause(450);
  check(document.getElementById('maintenancePaymentModal').classList.contains('open'),'فشل الحفظ يبقي النموذج مفتوحًا');
  QA.fail=false;submit(form);await pause(450);
  check(db.expenses.filter(x=>x.maintenancePaymentId).length===1,'إعادة المحاولة لا تكرر المصروف');
  check(ResortAccountCore.maintenanceSummary(db.maintenanceJobs[0]).remaining===500,'متبقي الصيانة 500');
  check(ResortAccountCore.currentBalance(db)===-100,'الرصيد 600 ناقص دفعة صيانة 700');
  check(QA.errors.length===0,'لا أخطاء تنفيذ غير معالجة');
  result.textContent+='نجحت السيناريوهات';
 }catch(e){result.textContent+='فشل: '+e.message}
 finally{QA.fail=false;QA.delay=0}
};
})();
