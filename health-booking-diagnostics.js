(()=>{
'use strict';
function install(){
 const original=window.openSystemHealthDetails;
 if(typeof original!=='function'||original.__bookingDiagnostics)return false;
 function enhance(){
  const container=document.getElementById('systemHealthDetails');
  if(!container||container.querySelector('[data-booking-diagnostics]')||typeof db==='undefined')return;
  const bookings=Array.isArray(db.bookings)?db.bookings:[];
  const rows=bookings.filter(b=>b.recordType!=='family'&&b.status==='مؤكد'&&typeof getPaidAmount==='function'&&getPaidAmount(b)<=0);
  if(!rows.length)return;
  const section=document.createElement('div');section.className='health-detail-group';section.dataset.bookingDiagnostics='1';
  const title=document.createElement('h3');title.textContent='الحجوزات التي تحتاج مراجعة';section.append(title);
  const note=document.createElement('div');note.className='meta';note.textContent='هذه السجلات هي سبب تنبيه «حجوزات مؤكدة دون عربون».';section.append(note);
  rows.forEach(b=>{
   const paid=getPaidAmount(b),total=Number(b.total||0),payments=Array.isArray(b.payments)?b.payments:[];
   const deposit=payments.filter(p=>p&&p.type==='deposit').reduce((s,p)=>s+Number(p.amount||0),0);
   const card=document.createElement('div');card.style.cssText='margin-top:10px;padding:12px;border:1px solid #e0b84f;border-radius:14px;background:#fffaf0';
   const head=document.createElement('b');head.textContent=b.name||'عميل بدون اسم';card.append(head);
   const meta=document.createElement('div');meta.className='meta';meta.textContent=`رقم الحجز: ${b.code||'—'} • التاريخ: ${b.date||'—'} • الإجمالي: ${total.toLocaleString('ar-SA')} ر.س • المدفوع: ${paid.toLocaleString('ar-SA')} ر.س • العربون: ${deposit.toLocaleString('ar-SA')} ر.س`;card.append(meta);
   const reason=document.createElement('div');reason.className='meta';reason.textContent=deposit<=0?'سبب التنبيه: الحجز مؤكد ولا توجد دفعة عربون مسجلة.':'سبب التنبيه: سجل الدفعات موجود لكن إجمالي المدفوع المحسوب يساوي صفرًا.';card.append(reason);
   const button=document.createElement('button');button.type='button';button.className='primary';button.style.marginTop='9px';button.textContent='فتح الحجز ومراجعته';button.addEventListener('click',()=>{if(typeof closeModal==='function')closeModal('systemHealthModal');if(typeof switchView==='function')switchView('bookings');setTimeout(()=>{if(typeof openBooking==='function')openBooking(b.id)},80)});card.append(button);
   section.append(card);
  });
  const group=[...container.querySelectorAll('.health-detail-group')].find(x=>x.querySelector('h3')?.textContent.trim()==='سلامة البيانات');
  if(group)group.after(section);else container.append(section);
 }
 const wrapped=function(){const out=original.apply(this,arguments);setTimeout(enhance,0);return out};wrapped.__bookingDiagnostics=true;window.openSystemHealthDetails=wrapped;return true;
}
if(!install())setTimeout(install,1200);
})();
