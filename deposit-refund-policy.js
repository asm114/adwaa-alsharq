(()=>{
'use strict';
if(window.__adwaaDepositRefundPolicyInstalled)return;
window.__adwaaDepositRefundPolicyInstalled=true;

const safeNumber=value=>Math.max(0,Number(value||0));
const todayIso=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dispositionLabel=value=>({retained:'العربون غير مسترد',refunded:'تم إرجاع العربون كاملًا',partial:'تم إرجاع جزء من العربون'}[value]||'لم يحدد');
const POLICY_TEXT='سياسة العربون: العربون المدفوع غير مسترد في حال إلغاء الحجز من قبل العميل. وفي حال تعذر تنفيذ الحجز من جهة المنتجع يُعاد العربون كاملًا.';

function currentBooking(){
  const rows=Array.isArray(window.db?.bookings)?window.db.bookings:[];
  const id=String(document.getElementById('bId')?.value||'').trim();
  const code=String(document.getElementById('bCode')?.value||'').trim();
  return rows.find(row=>(id&&String(row?.id||'')===id)||(code&&String(row?.code||'')===code))||null;
}
function depositAmount(booking=currentBooking()){
  const ui=safeNumber(document.getElementById('bookingDepositAmount')?.value);
  if(ui>0)return ui;
  const payments=Array.isArray(booking?.payments)?booking.payments:[];
  const deposit=payments.find(row=>row?.type==='deposit');
  if(deposit)return safeNumber(deposit.amount);
  return safeNumber(booking?.paid);
}
function bookingHasDeposit(booking){return depositAmount(booking)>0}
function readState(){
  return {
    status:String(document.getElementById('depositDisposition')?.value||'retained'),
    refundAmount:safeNumber(document.getElementById('depositRefundAmount')?.value),
    refundDate:String(document.getElementById('depositRefundDate')?.value||todayIso()),
    refundMethod:String(document.getElementById('depositRefundMethod')?.value||'transfer'),
    note:String(document.getElementById('depositRefundNote')?.value||'').trim()
  };
}
function validateState(state,amount){
  if(!['retained','refunded','partial'].includes(state.status))return 'اختر حالة العربون.';
  if(state.status==='retained')return '';
  if(!(state.refundAmount>0))return 'أدخل مبلغ العربون المُرجع.';
  if(amount>0&&state.refundAmount>amount)return `مبلغ الإرجاع لا يمكن أن يتجاوز العربون (${amount} ر.س).`;
  if(state.status==='refunded'&&amount>0&&Math.abs(state.refundAmount-amount)>0.009)return 'في الإرجاع الكامل يجب أن يساوي مبلغ الإرجاع قيمة العربون.';
  return '';
}
function buildCancellationRecord(state,amount){
  return {
    status:state.status,
    depositAmount:amount,
    refundAmount:state.status==='retained'?0:state.refundAmount,
    refundDate:state.status==='retained'?'':state.refundDate,
    refundMethod:state.status==='retained'?'':state.refundMethod,
    note:state.note||'',
    recordedAt:new Date().toISOString()
  };
}
function applyCancellationState(snapshot){
  if(snapshot.status!=='ملغي'||snapshot.amount<=0)return false;
  const rows=Array.isArray(window.db?.bookings)?window.db.bookings:[];
  const booking=rows.find(row=>(snapshot.id&&String(row?.id||'')===snapshot.id)||(snapshot.code&&String(row?.code||'')===snapshot.code));
  if(!booking)return false;
  const before=booking.depositCancellation&&typeof booking.depositCancellation==='object'?{...booking.depositCancellation}:null;
  const next=buildCancellationRecord(snapshot.state,snapshot.amount);
  booking.depositCancellation=next;
  booking.updatedAt=new Date().toISOString();
  if(typeof window.addAudit==='function')try{window.addAudit('تعديل','حالة عربون',`${booking.name||''} — #${booking.code||''}`,before,next)}catch(_){}
  return true;
}
function injectStyles(){
  if(document.getElementById('depositRefundPolicyStyles'))return;
  const style=document.createElement('style');style.id='depositRefundPolicyStyles';style.textContent=`
    .deposit-refund-policy{grid-column:1/-1;border:1px solid #ead9ae;background:#fffaf0;border-radius:16px;padding:13px;display:none;gap:10px}
    .deposit-refund-policy.show{display:grid}.deposit-refund-policy h4{margin:0;color:#76520b}.deposit-refund-policy .refund-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.deposit-refund-policy .refund-full{grid-column:1/-1}.deposit-refund-policy .refund-summary{font-size:12px;color:#76520b;font-weight:800}.deposit-policy-note{grid-column:1/-1;font-size:12px;line-height:1.7;color:#76520b;background:#fff6dd;border:1px solid #f0d494;border-radius:12px;padding:9px 11px}@media(max-width:620px){.deposit-refund-policy .refund-grid{grid-template-columns:1fr}.deposit-refund-policy .refund-full{grid-column:auto}}
  `;document.head.appendChild(style);
}
function injectUi(){
  const grid=document.querySelector('#bookingModal .booking-payment-section .booking-section-grid');
  if(!grid)return false;
  injectStyles();
  if(!document.getElementById('depositPolicyNote')){
    const note=document.createElement('div');note.id='depositPolicyNote';note.className='deposit-policy-note';note.textContent=POLICY_TEXT;grid.appendChild(note);
  }
  if(document.getElementById('depositRefundPolicy'))return true;
  const box=document.createElement('section');box.id='depositRefundPolicy';box.className='deposit-refund-policy';box.innerHTML=`
    <h4>حالة العربون عند إلغاء الحجز</h4>
    <div id="depositRefundSummary" class="refund-summary"></div>
    <div class="refund-grid">
      <label class="refund-full"><span class="label">حالة العربون</span><select id="depositDisposition"><option value="retained">غير مسترد</option><option value="refunded">تم إرجاعه كاملًا</option><option value="partial">إرجاع جزئي</option></select></label>
      <label data-refund-detail><span class="label">المبلغ المُرجع</span><input id="depositRefundAmount" type="number" min="0" step="0.01" inputmode="decimal"></label>
      <label data-refund-detail><span class="label">تاريخ الإرجاع</span><input id="depositRefundDate" type="date"></label>
      <label data-refund-detail><span class="label">طريقة الإرجاع</span><select id="depositRefundMethod"><option value="transfer">تحويل بنكي</option><option value="cash">نقد</option><option value="card">شبكة / بطاقة</option><option value="other">أخرى</option></select></label>
      <label class="refund-full" data-refund-detail><span class="label">ملاحظة</span><input id="depositRefundNote" maxlength="180" placeholder="مثال: تم التحويل للعميل"></label>
    </div>`;
  grid.appendChild(box);
  document.getElementById('depositDisposition')?.addEventListener('change',refreshVisibility);
  document.getElementById('bStatus')?.addEventListener('change',refreshVisibility);
  return true;
}
function refreshVisibility(){
  if(!injectUi())return;
  const cancelled=document.getElementById('bStatus')?.value==='ملغي';
  const amount=depositAmount();
  const box=document.getElementById('depositRefundPolicy');
  box?.classList.toggle('show',cancelled&&amount>0);
  const state=readState();
  document.querySelectorAll('#depositRefundPolicy [data-refund-detail]').forEach(el=>el.style.display=state.status==='retained'?'none':'');
  const summary=document.getElementById('depositRefundSummary');if(summary)summary.textContent=cancelled?(amount>0?`العربون المسجل: ${amount} ر.س — ${dispositionLabel(state.status)}`:'لا يوجد عربون مسجل على هذا الحجز.'):'يظهر هذا القسم فقط عند إلغاء حجز عليه عربون.';
  if(state.status==='refunded'&&amount>0){const input=document.getElementById('depositRefundAmount');if(input&&document.activeElement!==input)input.value=String(amount)}
}
function loadState(){
  if(!injectUi())return;
  const booking=currentBooking();const state=booking?.depositCancellation||{};
  const disposition=document.getElementById('depositDisposition');if(disposition)disposition.value=state.status||'retained';
  const amount=document.getElementById('depositRefundAmount');if(amount)amount.value=state.refundAmount?String(state.refundAmount):'';
  const date=document.getElementById('depositRefundDate');if(date)date.value=state.refundDate||todayIso();
  const method=document.getElementById('depositRefundMethod');if(method)method.value=state.refundMethod||'transfer';
  const note=document.getElementById('depositRefundNote');if(note)note.value=state.note||'';
  refreshVisibility();
}
function wrapSaveBooking(){
  const original=window.saveBooking;if(typeof original!=='function'||original.__depositRefundPolicyWrapped)return false;
  const wrapped=async function(event){
    injectUi();
    const booking=currentBooking();const amount=depositAmount(booking);const status=String(document.getElementById('bStatus')?.value||'');const state=readState();
    if(status==='ملغي'&&amount>0){const error=validateState(state,amount);if(error){event?.preventDefault?.();alert(error);return}}
    const snapshot={id:String(document.getElementById('bId')?.value||''),code:String(document.getElementById('bCode')?.value||''),status,amount,state};
    const shouldAttach=status==='ملغي'&&amount>0;
    const originalPersist=window.persist;
    let interceptedPersist=null;
    let applied=false;
    if(shouldAttach&&typeof originalPersist==='function'){
      interceptedPersist=async function(){
        if(!applied){applied=applyCancellationState(snapshot)}
        return originalPersist.apply(this,arguments);
      };
      interceptedPersist.__depositRefundPolicyIntercept=true;
      window.persist=interceptedPersist;
    }
    try{
      return await original.apply(this,arguments);
    }finally{
      if(interceptedPersist&&window.persist===interceptedPersist)window.persist=originalPersist;
    }
  };
  wrapped.__depositRefundPolicyWrapped=true;wrapped.__original=original;window.saveBooking=wrapped;return true;
}
function wrapOpenBooking(){
  const original=window.openBooking;if(typeof original!=='function'||original.__depositRefundPolicyWrapped)return false;
  const wrapped=function(){const result=original.apply(this,arguments);setTimeout(loadState,0);return result};wrapped.__depositRefundPolicyWrapped=true;wrapped.__original=original;window.openBooking=wrapped;return true;
}
function wrapWelcomeMessage(){
  const original=window.welcomeMessageText;if(typeof original!=='function'||original.__depositPolicyWrapped)return false;
  const wrapped=function(booking){
    const text=String(original.apply(this,arguments)||'');
    const b=booking||currentBooking();
    if(!bookingHasDeposit(b)||text.includes(POLICY_TEXT))return text;
    return `${text}\n\n${POLICY_TEXT}`;
  };
  wrapped.__depositPolicyWrapped=true;wrapped.__original=original;window.welcomeMessageText=wrapped;return true;
}
function start(){
  injectUi();loadState();wrapOpenBooking();wrapSaveBooking();wrapWelcomeMessage();
  let tries=0;const timer=setInterval(()=>{tries++;injectUi();wrapOpenBooking();wrapSaveBooking();wrapWelcomeMessage();if(tries>=20)clearInterval(timer)},250);
  document.addEventListener('input',event=>{if(['bookingDepositAmount','bPaid'].includes(event.target?.id))refreshVisibility()});
  document.addEventListener('change',event=>{if(['bookingDepositAmount','bPaid','bStatus','depositDisposition'].includes(event.target?.id))refreshVisibility()});
}
window.__adwaaDepositPolicy={depositAmount,bookingHasDeposit,readState,validateState,buildCancellationRecord,applyCancellationState,dispositionLabel,POLICY_TEXT};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
