(()=>{
  'use strict';
  if(window.__adwaaPaymentHistoryInstalled)return;
  window.__adwaaPaymentHistoryInstalled=true;
  let paymentDraft=[];
  let paymentPanelOpen=false;
  const safeNumber=value=>Math.max(0,Number(value||0));
  const todayIso=()=>typeof isoToday==='function'?isoToday():new Date().toISOString().slice(0,10);
  const paymentId=()=>window.crypto?.randomUUID?.()||`pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const paymentSum=items=>(items||[]).reduce((sum,item)=>sum+safeNumber(item.amount),0);
  const paymentTypeLabel=value=>({deposit:'عربون',partial:'دفعة إضافية',final:'سداد نهائي',legacy:'دفعة سابقة'}[value]||value||'دفعة');
  const paymentMethodLabel=value=>({transfer:'تحويل بنكي',cash:'نقد',card:'شبكة / بطاقة',other:'أخرى',unknown:'غير محدد'}[value]||value||'غير محدد');
  const bookingState=()=>typeof db!=='undefined'&&db&&Array.isArray(db.bookings)?db:null;

  function normalizePayments(booking){
    const rows=Array.isArray(booking?.payments)?booking.payments:[];
    if(rows.length)return rows.map((item,index)=>({id:String(item.id||paymentId()),amount:safeNumber(item.amount),type:String(item.type||'partial'),method:String(item.method||'unknown'),date:String(item.date||booking?.date||todayIso()),note:String(item.note||''),createdAt:String(item.createdAt||new Date().toISOString()),order:Number(item.order??index)})).filter(item=>item.amount>0);
    const paid=safeNumber(booking?.paid);
    return paid>0?[{id:paymentId(),amount:paid,type:'legacy',method:'unknown',date:String(booking?.date||todayIso()),note:'مبلغ مسجل قبل إضافة سجل الدفعات',createdAt:new Date().toISOString(),order:0}]:[];
  }

  function installStyles(){
    if(document.getElementById('bookingPaymentHistoryStyles'))return;
    const style=document.createElement('style');style.id='bookingPaymentHistoryStyles';style.textContent=`
      .payment-history-field{display:grid;gap:8px}.payment-history-field .payment-paid-row{display:flex;gap:8px;align-items:center}.payment-history-field .payment-paid-row input{flex:1;background:#f7faf8;font-weight:900}.payment-add-toggle{white-space:nowrap;padding:12px 14px}.payment-history-card{grid-column:1/-1;border:1px solid #d8e1dc;background:#f8fbf9;border-radius:18px;padding:14px;display:none}.payment-history-card.open{display:block}.payment-history-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.payment-history-head h3{margin:0;font-size:18px}.payment-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.payment-summary div{background:#fff;border:1px solid var(--line);border-radius:13px;padding:10px}.payment-summary span{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}.payment-summary b{font-size:17px}.payment-entry-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:12px;background:#fff;border:1px solid var(--line);border-radius:14px}.payment-entry-form .full{grid-column:1/-1}.payment-entry-actions{display:flex;gap:8px;align-items:end}.payment-history-list{display:grid;gap:8px;margin-top:12px}.payment-history-item{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:14px;padding:11px}.payment-history-item h4{margin:0 0 5px;font-size:15px}.payment-history-item .meta{line-height:1.6}.payment-history-empty{text-align:center;color:var(--muted);padding:15px;background:#fff;border:1px dashed #ccd7d1;border-radius:13px}.payment-overpaid{color:#a63c3c!important}@media(max-width:620px){.payment-history-field .payment-paid-row{align-items:stretch;flex-direction:column}.payment-add-toggle{width:100%}.payment-summary{grid-template-columns:1fr}.payment-entry-form{grid-template-columns:1fr}.payment-entry-form .full{grid-column:auto}}
    `;document.head.appendChild(style);
  }

  function injectUi(){
    const paid=document.getElementById('bPaid');if(!paid)return false;
    if(document.getElementById('bookingPaymentHistoryCard'))return true;
    installStyles();
    const wrap=paid.parentElement;wrap.classList.add('payment-history-field');
    const label=wrap.querySelector('.label');if(label&&label.childNodes[0])label.childNodes[0].textContent='المدفوع تلقائيًا ';
    paid.readOnly=true;paid.setAttribute('aria-readonly','true');
    const paidRow=document.createElement('div');paidRow.className='payment-paid-row';paid.parentNode.insertBefore(paidRow,paid);paidRow.appendChild(paid);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary payment-add-toggle';toggle.id='bookingPaymentAddToggle';toggle.textContent='➕ إضافة دفعة';toggle.addEventListener('click',()=>{paymentPanelOpen=!paymentPanelOpen;renderPayments();if(paymentPanelOpen)setTimeout(()=>document.getElementById('paymentAmount')?.focus(),0)});paidRow.appendChild(toggle);
    const card=document.createElement('section');card.id='bookingPaymentHistoryCard';card.className='payment-history-card full';card.innerHTML=`
      <div class="payment-history-head"><div><h3>💳 سجل دفعات الحجز</h3><div class="meta">كل دفعة تُحفظ منفصلة، ويُحسب المدفوع والمتبقي تلقائيًا.</div></div><button class="secondary small" type="button" id="paymentCloseButton">إغلاق</button></div>
      <div class="payment-summary"><div><span>إجمالي الحجز</span><b id="paymentTotalSummary">0 ر.س</b></div><div><span>مجموع المدفوع</span><b id="paymentPaidSummary">0 ر.س</b></div><div><span>المتبقي</span><b id="paymentRemainingSummary">0 ر.س</b></div></div>
      <div class="payment-entry-form">
        <label><span class="label">مبلغ الدفعة</span><input id="paymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="مثال: 834"></label>
        <label><span class="label">نوع الدفعة</span><select id="paymentType"><option value="deposit">عربون</option><option value="partial" selected>دفعة إضافية</option><option value="final">سداد نهائي</option></select></label>
        <label><span class="label">طريقة الدفع</span><select id="paymentMethod"><option value="transfer" selected>تحويل بنكي</option><option value="cash">نقد</option><option value="card">شبكة / بطاقة</option><option value="other">أخرى</option></select></label>
        <label><span class="label">تاريخ الدفعة</span><input id="paymentDate" type="date"></label>
        <label class="full"><span class="label">ملاحظة اختيارية</span><input id="paymentNote" maxlength="180" placeholder="مثال: تحويل إضافي"></label>
        <div class="full payment-entry-actions"><button class="primary" type="button" id="paymentSaveButton">إضافة الدفعة</button><button class="secondary" type="button" id="paymentFillRemainingButton">استخدام المبلغ المتبقي</button></div>
      </div><div id="bookingPaymentHistoryList" class="payment-history-list"></div>`;
    const totalWrap=document.getElementById('bTotal')?.parentElement;(totalWrap?.parentElement||wrap.parentElement).insertBefore(card,totalWrap?.nextSibling||wrap.nextSibling);
    document.getElementById('paymentDate').value=todayIso();
    document.getElementById('paymentCloseButton').addEventListener('click',()=>{paymentPanelOpen=false;renderPayments()});
    document.getElementById('paymentSaveButton').addEventListener('click',addPaymentFromForm);
    document.getElementById('paymentFillRemainingButton').addEventListener('click',()=>{const remaining=Math.max(0,safeNumber(document.getElementById('bTotal')?.value)-paymentSum(paymentDraft));document.getElementById('paymentAmount').value=remaining||'';document.getElementById('paymentType').value='final'});
    document.getElementById('bTotal')?.addEventListener('input',renderPayments);return true;
  }

  function addPaymentFromForm(){
    const amount=safeNumber(document.getElementById('paymentAmount')?.value),total=safeNumber(document.getElementById('bTotal')?.value);if(!(amount>0)){alert('أدخل مبلغ الدفعة.');return}
    const nextPaid=paymentSum(paymentDraft)+amount;if(total>0&&nextPaid>total){alert(`مجموع الدفعات سيتجاوز إجمالي الحجز بمبلغ ${money(nextPaid-total)}. راجع المبلغ.`);return}
    paymentDraft.push({id:paymentId(),amount,type:document.getElementById('paymentType')?.value||'partial',method:document.getElementById('paymentMethod')?.value||'transfer',date:document.getElementById('paymentDate')?.value||todayIso(),note:String(document.getElementById('paymentNote')?.value||'').trim(),createdAt:new Date().toISOString(),order:paymentDraft.length});
    document.getElementById('paymentAmount').value='';document.getElementById('paymentNote').value='';document.getElementById('paymentType').value='partial';renderPayments();
  }

  function deletePayment(id){const item=paymentDraft.find(row=>row.id===id);if(!item)return;if(!confirm(`حذف دفعة ${money(item.amount)} من سجل الحجز؟`))return;paymentDraft=paymentDraft.filter(row=>row.id!==id);renderPayments()}
  window.deleteBookingPayment=deletePayment;

  function renderPayments(){
    if(!injectUi())return;
    const total=safeNumber(document.getElementById('bTotal')?.value),paid=paymentSum(paymentDraft),remaining=Math.max(0,total-paid),over=Math.max(0,paid-total);
    const paidInput=document.getElementById('bPaid');if(paidInput)paidInput.value=String(paid);
    document.getElementById('bookingPaymentHistoryCard')?.classList.toggle('open',paymentPanelOpen);
    const toggle=document.getElementById('bookingPaymentAddToggle');if(toggle)toggle.textContent=paymentDraft.length?`💳 الدفعات (${paymentDraft.length})`:'➕ إضافة دفعة';
    const totalEl=document.getElementById('paymentTotalSummary'),paidEl=document.getElementById('paymentPaidSummary'),remainingEl=document.getElementById('paymentRemainingSummary');if(totalEl)totalEl.textContent=money(total);if(paidEl)paidEl.textContent=money(paid);if(remainingEl){remainingEl.textContent=over?`زيادة ${money(over)}`:remaining===0&&total>0?'مكتمل السداد':money(remaining);remainingEl.classList.toggle('payment-overpaid',over>0)}
    const list=document.getElementById('bookingPaymentHistoryList');if(!list)return;list.innerHTML=paymentDraft.length?paymentDraft.map((item,index)=>`<article class="payment-history-item"><div><h4>${index+1}. ${paymentTypeLabel(item.type)} — ${money(item.amount)}</h4><div class="meta">${paymentMethodLabel(item.method)} • ${escapeHtml(item.date||'—')}${item.note?`<br>${escapeHtml(item.note)}`:''}</div></div><button class="danger small" type="button" onclick="deleteBookingPayment('${escapeHtml(item.id)}')">حذف</button></article>`).join(''):'<div class="payment-history-empty">لا توجد دفعات مسجلة بعد.</div>';
  }

  function loadBookingPayments(){const id=document.getElementById('bId')?.value||'',state=bookingState(),booking=id?(state?.bookings||[]).find(item=>item.id===id):null;paymentDraft=normalizePayments(booking);paymentPanelOpen=false;renderPayments()}

  function installWrappers(){
    if(typeof window.openBooking==='function'&&!window.openBooking.__paymentHistoryWrapped){const originalOpen=window.openBooking,wrapped=function(...args){const result=originalOpen.apply(this,args);setTimeout(loadBookingPayments,0);return result};wrapped.__paymentHistoryWrapped=true;window.openBooking=wrapped}
    if(typeof window.saveBooking==='function'&&!window.saveBooking.__paymentHistoryWrapped){
      const originalSave=window.saveBooking,wrapped=async function(event){
        if(!paymentDraft.length&&safeNumber(document.getElementById('bPaid')?.value)>0)paymentDraft=[{id:paymentId(),amount:safeNumber(document.getElementById('bPaid').value),type:'deposit',method:'unknown',date:todayIso(),note:'دفعة مسجلة من الإدخال السريع',createdAt:new Date().toISOString(),order:0}];
        const paid=paymentSum(paymentDraft),total=safeNumber(document.getElementById('bTotal')?.value);if(total>0&&paid>total){alert('مجموع الدفعات أكبر من إجمالي الحجز. عدّل الدفعات قبل الحفظ.');return}
        const beforeId=document.getElementById('bId')?.value||'',code=document.getElementById('bCode')?.value||'';if(document.getElementById('bPaid'))document.getElementById('bPaid').value=String(paid);
        const result=await originalSave.call(this,event);
        if(document.getElementById('bookingModal')?.classList.contains('open'))return result;
        const state=bookingState(),booking=(state?.bookings||[]).find(item=>item.id===beforeId)||(state?.bookings||[]).find(item=>item.code===code);
        if(booking){booking.payments=paymentDraft.map((item,index)=>({...item,amount:safeNumber(item.amount),order:index}));booking.paid=paymentSum(booking.payments);if(typeof addAudit==='function')addAudit('تحديث دفعات','حجز',`تم حفظ ${booking.payments.length} دفعة بإجمالي ${money(booking.paid)}`,null,{bookingId:booking.id,payments:booking.payments});if(typeof persist==='function')await persist()}
        return result;
      };wrapped.__paymentHistoryWrapped=true;window.saveBooking=wrapped;
    }
  }

  function initialize(){if(injectUi())renderPayments();installWrappers();setTimeout(()=>{if(injectUi())renderPayments();installWrappers()},500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
