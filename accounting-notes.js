(function accountingNotesModule(){
'use strict';

const SECTION_ID='accountingNotesSection';
const NOTE_MODAL_ID='accountingNoteModal';
const PAYMENT_MODAL_ID='accountingPaymentModal';

function notes(){
  if(!Array.isArray(window.db?.accountingNotes)) window.db.accountingNotes=[];
  return window.db.accountingNotes;
}
function payments(note){
  return (Array.isArray(note?.payments)?note.payments:[]).map(row=>({
    ...row,
    amount:Math.max(0,Number(row?.amount||0))
  }));
}
function summary(note){
  const principal=Math.max(0,Number(note?.principalAmount||0));
  const paid=payments(note).reduce((sum,row)=>sum+row.amount,0);
  return {principal,paid,remaining:Math.max(0,principal-paid)};
}
function totals(){
  return notes().reduce((acc,n)=>{
    const s=summary(n);
    acc.principal+=s.principal;acc.paid+=s.paid;acc.remaining+=s.remaining;
    return acc;
  },{principal:0,paid:0,remaining:0});
}
function moneyValue(value){
  if(typeof window.money==='function') return window.money(value);
  return new Intl.NumberFormat('ar-SA',{maximumFractionDigits:2}).format(Number(value||0))+' ر.س';
}
function esc(value){
  if(typeof window.escapeHtml==='function') return window.escapeHtml(String(value??''));
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function today(){
  if(typeof window.isoToday==='function') return window.isoToday();
  return new Date().toISOString().slice(0,10);
}
function findNote(id){return notes().find(n=>n.id===id)||null;}
function uid(){return crypto.randomUUID();}
function now(){return new Date().toISOString();}

function installStyles(){
  if(document.getElementById('accountingNotesStyles')) return;
  const style=document.createElement('style');
  style.id='accountingNotesStyles';
  style.textContent=`
  .accounting-notes-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:16px 18px 4px}
  .accounting-note-summary-card{background:#f8faf9;border:1px solid var(--line);border-radius:15px;padding:13px}
  .accounting-note-summary-card span{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}
  .accounting-note-summary-card b{display:block;font-size:20px}
  .accounting-notes-list{display:grid;gap:10px;padding:14px 18px 18px}
  .accounting-note-card{border:1px solid var(--line);border-radius:17px;background:#fff;padding:14px;display:grid;gap:10px}
  .accounting-note-card.settled{background:#f4fbf7;border-color:#acd7c4}
  .accounting-note-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .accounting-note-head h4{margin:0 0 4px}
  .accounting-note-status{display:inline-flex;padding:6px 9px;border-radius:999px;font-size:12px;font-weight:900;background:#fff3d9;color:#8b6500}
  .accounting-note-card.settled .accounting-note-status{background:#e4f4ee;color:#14785f}
  .accounting-note-figures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .accounting-note-figure{border:1px solid var(--line);border-radius:12px;padding:10px;background:#fafcfb}
  .accounting-note-figure span{display:block;color:var(--muted);font-size:11px}
  .accounting-note-figure b{display:block;margin-top:4px}
  .accounting-payment-list{display:grid;gap:6px}
  .accounting-payment-row{border:1px solid #e5e9e7;border-radius:12px;padding:9px;background:#fafcfb;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .accounting-payment-row .actions{margin-top:5px}
  .accounting-note-actions{display:flex;gap:7px;flex-wrap:wrap}
  .accounting-note-actions button{min-height:38px}
  .accounting-note-explanation{margin:0 18px 12px}
  .accounting-modal .sheet{max-width:640px;margin:auto}
  @media(max-width:620px){
    .accounting-notes-summary,.accounting-note-figures{grid-template-columns:1fr}
    .accounting-payment-row,.accounting-note-head{flex-direction:column}
    .accounting-note-actions button{flex:1}
  }`;
  document.head.appendChild(style);
}

function installSection(){
  const finance=document.getElementById('expenses');
  if(!finance||document.getElementById(SECTION_ID)) return;
  const section=document.createElement('div');
  section.className='section';
  section.id=SECTION_ID;
  section.innerHTML=`
    <div class="section-head">
      <div>
        <h3>📝 الملاحظات الحسابية</h3>
        <div class="meta">ذمم شخصية على حساب المنتجع — مثل مبلغ استلفته ثم تسدده على دفعات.</div>
      </div>
      <button class="primary" type="button" onclick="openAccountingNote()">+ ملاحظة حسابية</button>
    </div>
    <div class="notice accounting-note-explanation">
      هذه المبالغ <b>لا تُسجل كمصروف ولا تؤثر على صافي ربح المنتجع</b>؛ هي سجل ذمة مستقل للمتابعة والسداد فقط.
    </div>
    <div class="accounting-notes-summary">
      <div class="accounting-note-summary-card"><span>إجمالي المبالغ المسجلة</span><b class="money" id="accountingPrincipalTotal">0 ر.س</b></div>
      <div class="accounting-note-summary-card"><span>إجمالي ما تم سداده</span><b class="money finance-positive" id="accountingPaidTotal">0 ر.س</b></div>
      <div class="accounting-note-summary-card"><span>المتبقي لحساب المنتجع</span><b class="money finance-negative" id="accountingRemainingTotal">0 ر.س</b></div>
    </div>
    <div id="accountingNotesList" class="accounting-notes-list"></div>`;
  const chart=finance.querySelector('#financeChart')?.closest('.section');
  if(chart) finance.insertBefore(section,chart);
  else finance.appendChild(section);
}

function installModals(){
  if(!document.getElementById(NOTE_MODAL_ID)){
    const modal=document.createElement('div');
    modal.id=NOTE_MODAL_ID;modal.className='modal accounting-modal';
    modal.innerHTML=`<div class="sheet">
      <div class="sheet-head"><h2 id="accountingNoteModalTitle">ملاحظة حسابية</h2><button class="close" type="button" onclick="closeModal('${NOTE_MODAL_ID}')">×</button></div>
      <form id="accountingNoteForm">
        <input type="hidden" name="id">
        <div class="form-grid">
          <label>العنوان<input name="title" maxlength="120" placeholder="مثال: استلاف من حساب المنتجع" required></label>
          <label>أصل المبلغ<input name="principalAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
          <label>التاريخ<input name="date" type="date" required></label>
          <label class="full">الملاحظة<textarea name="note" maxlength="1200" placeholder="مثال: استخدمت المبلغ لمصاريف شخصية"></textarea></label>
        </div>
        <div class="actions">
          <button class="secondary" type="button" onclick="closeModal('${NOTE_MODAL_ID}')">إلغاء</button>
          <button class="primary" type="submit">حفظ</button>
        </div>
      </form>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('form').addEventListener('submit',saveAccountingNote);
  }
  if(!document.getElementById(PAYMENT_MODAL_ID)){
    const modal=document.createElement('div');
    modal.id=PAYMENT_MODAL_ID;modal.className='modal accounting-modal';
    modal.innerHTML=`<div class="sheet">
      <div class="sheet-head"><h2 id="accountingPaymentModalTitle">إضافة سداد</h2><button class="close" type="button" onclick="closeModal('${PAYMENT_MODAL_ID}')">×</button></div>
      <form id="accountingPaymentForm">
        <input type="hidden" name="noteId"><input type="hidden" name="paymentId">
        <div class="form-grid">
          <label>مبلغ السداد<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
          <label>التاريخ<input name="date" type="date" required></label>
          <label class="full">ملاحظة السداد<input name="note" maxlength="500" placeholder="مثال: سداد دفعة أولى"></label>
        </div>
        <div class="actions">
          <button class="secondary" type="button" onclick="closeModal('${PAYMENT_MODAL_ID}')">إلغاء</button>
          <button class="primary" type="submit">حفظ السداد</button>
        </div>
      </form>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('form').addEventListener('submit',saveAccountingPayment);
  }
}

function render(){
  installSection();installModals();
  const list=document.getElementById('accountingNotesList');
  if(!list)return;
  const total=totals();
  const setText=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=moneyValue(val);};
  setText('accountingPrincipalTotal',total.principal);
  setText('accountingPaidTotal',total.paid);
  setText('accountingRemainingTotal',total.remaining);

  const ordered=[...notes()].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));
  list.innerHTML=ordered.length?ordered.map(note=>{
    const s=summary(note),rows=payments(note).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const settled=s.remaining<=0.009;
    return `<article class="accounting-note-card ${settled?'settled':''}" data-accounting-note="${esc(note.id)}">
      <div class="accounting-note-head">
        <div><h4>${esc(note.title||'ملاحظة حسابية')}</h4><div class="meta">${esc(note.date||'')} ${note.note?`• ${esc(note.note)}`:''}</div></div>
        <span class="accounting-note-status">${settled?'مسدد بالكامل':'متبقي '+moneyValue(s.remaining)}</span>
      </div>
      <div class="accounting-note-figures">
        <div class="accounting-note-figure"><span>أصل المبلغ</span><b class="money">${moneyValue(s.principal)}</b></div>
        <div class="accounting-note-figure"><span>المسدد</span><b class="money finance-positive">${moneyValue(s.paid)}</b></div>
        <div class="accounting-note-figure"><span>المتبقي</span><b class="money ${settled?'finance-positive':'finance-negative'}">${moneyValue(s.remaining)}</b></div>
      </div>
      <div>
        <b style="font-size:13px">سجل السداد</b>
        <div class="accounting-payment-list">
          ${rows.length?rows.map(row=>`<div class="accounting-payment-row">
            <div><b class="money">${moneyValue(row.amount)}</b><div class="meta">${esc(row.date||'')}${row.note?` • ${esc(row.note)}`:''}</div></div>
            <div class="actions"><button class="secondary small" type="button" onclick="openAccountingPayment('${esc(note.id)}','${esc(row.id)}')">تعديل</button><button class="danger small" type="button" onclick="deleteAccountingPayment('${esc(note.id)}','${esc(row.id)}')">حذف</button></div>
          </div>`).join(''):'<div class="meta">لم يتم تسجيل أي سداد بعد.</div>'}
        </div>
      </div>
      <div class="accounting-note-actions">
        ${settled?'':`<button class="primary" type="button" onclick="openAccountingPayment('${esc(note.id)}')">+ إضافة سداد</button>`}
        <button class="secondary" type="button" onclick="openAccountingNote('${esc(note.id)}')">تعديل الملاحظة</button>
        <button class="danger" type="button" onclick="deleteAccountingNote('${esc(note.id)}')">حذف</button>
      </div>
    </article>`;
  }).join(''):'<div class="empty">لا توجد ملاحظات حسابية حتى الآن.</div>';
}

function openNote(id=''){
  installModals();
  const modal=document.getElementById(NOTE_MODAL_ID),form=document.getElementById('accountingNoteForm');
  const note=id?findNote(id):null;
  form.reset();
  form.elements.id.value=note?.id||'';
  form.elements.title.value=note?.title||'استلاف من حساب المنتجع';
  form.elements.principalAmount.value=note?.principalAmount??'';
  form.elements.date.value=note?.date||today();
  form.elements.note.value=note?.note||'';
  document.getElementById('accountingNoteModalTitle').textContent=note?'تعديل الملاحظة الحسابية':'إضافة ملاحظة حسابية';
  modal.classList.add('open');document.body.classList.add('modal-open');
}
async function saveAccountingNote(event){
  event.preventDefault();
  const form=event.currentTarget,id=form.elements.id.value,note=findNote(id);
  const principalAmount=Math.max(0,Number(form.elements.principalAmount.value||0));
  if(principalAmount<=0){alert('أدخل أصل المبلغ.');return;}
  const alreadyPaid=note?summary(note).paid:0;
  if(principalAmount+0.009<alreadyPaid){
    alert(`لا يمكن جعل أصل المبلغ أقل من إجمالي ما تم سداده (${moneyValue(alreadyPaid)}).`);
    return;
  }
  const next={
    id:note?.id||uid(),
    title:String(form.elements.title.value||'').trim()||'استلاف من حساب المنتجع',
    principalAmount,
    date:form.elements.date.value||today(),
    note:String(form.elements.note.value||'').trim(),
    payments:payments(note),
    createdAt:note?.createdAt||now(),
    updatedAt:now()
  };
  const before=note?JSON.parse(JSON.stringify(note)):null;
  if(note) Object.assign(note,next); else notes().push(next);
  if(typeof window.addAudit==='function') window.addAudit(note?'تعديل':'إضافة','ملاحظة حسابية',`${next.title} — ${moneyValue(principalAmount)}`,before,next);
  if(typeof window.persist==='function') await window.persist();
  if(typeof window.closeModal==='function') window.closeModal(NOTE_MODAL_ID);
  render();
}
async function deleteNote(id){
  const note=findNote(id);if(!note)return;
  const s=summary(note);
  const warning=s.remaining>0.009
    ?`هذه الملاحظة ما زال عليها ${moneyValue(s.remaining)}. هل تريد حذفها نهائيًا مع سجل السداد؟`
    :'حذف هذه الملاحظة الحسابية وسجل سدادها؟';
  if(!confirm(warning))return;
  const before=JSON.parse(JSON.stringify(note));
  window.db.accountingNotes=notes().filter(n=>n.id!==id);
  if(typeof window.addAudit==='function') window.addAudit('حذف','ملاحظة حسابية',note.title||'',before,null);
  if(typeof window.persist==='function') await window.persist();
  render();
}

function openPayment(noteId,paymentId=''){
  installModals();
  const note=findNote(noteId);if(!note)return;
  const payment=payments(note).find(row=>row.id===paymentId)||null;
  const form=document.getElementById('accountingPaymentForm');
  form.reset();
  form.elements.noteId.value=noteId;form.elements.paymentId.value=payment?.id||'';
  form.elements.amount.value=payment?.amount??'';
  form.elements.date.value=payment?.date||today();
  form.elements.note.value=payment?.note||'';
  document.getElementById('accountingPaymentModalTitle').textContent=payment?'تعديل السداد':'إضافة سداد';
  document.getElementById(PAYMENT_MODAL_ID).classList.add('open');document.body.classList.add('modal-open');
}
async function saveAccountingPayment(event){
  event.preventDefault();
  const form=event.currentTarget,note=findNote(form.elements.noteId.value);
  if(!note)return;
  const paymentId=form.elements.paymentId.value;
  const amount=Math.max(0,Number(form.elements.amount.value||0));
  if(amount<=0){alert('أدخل مبلغ السداد.');return;}
  const current=payments(note);
  const otherPaid=current.filter(row=>row.id!==paymentId).reduce((sum,row)=>sum+row.amount,0);
  const principal=summary(note).principal;
  if(otherPaid+amount>principal+0.009){
    alert(`السداد يتجاوز المتبقي. الحد الأعلى لهذه الدفعة هو ${moneyValue(Math.max(0,principal-otherPaid))}.`);
    return;
  }
  const existing=current.find(row=>row.id===paymentId)||null;
  const row={
    id:existing?.id||uid(),
    amount,
    date:form.elements.date.value||today(),
    note:String(form.elements.note.value||'').trim(),
    createdAt:existing?.createdAt||now(),
    updatedAt:now()
  };
  const before=existing?JSON.parse(JSON.stringify(existing)):null;
  note.payments=existing?current.map(x=>x.id===row.id?row:x):[...current,row];
  note.updatedAt=now();
  if(typeof window.addAudit==='function') window.addAudit(existing?'تعديل':'إضافة','سداد ملاحظة حسابية',`${note.title||'ملاحظة'} — ${moneyValue(amount)}`,before,row);
  if(typeof window.persist==='function') await window.persist();
  if(typeof window.closeModal==='function') window.closeModal(PAYMENT_MODAL_ID);
  render();
}
async function deletePayment(noteId,paymentId){
  const note=findNote(noteId);if(!note)return;
  const row=payments(note).find(x=>x.id===paymentId);if(!row)return;
  if(!confirm(`حذف سداد ${moneyValue(row.amount)}؟ سيعاد المبلغ إلى المتبقي.`))return;
  const before=JSON.parse(JSON.stringify(row));
  note.payments=payments(note).filter(x=>x.id!==paymentId);
  note.updatedAt=now();
  if(typeof window.addAudit==='function') window.addAudit('حذف','سداد ملاحظة حسابية',`${note.title||'ملاحظة'} — ${moneyValue(row.amount)}`,before,null);
  if(typeof window.persist==='function') await window.persist();
  render();
}

function install(){
  installStyles();installSection();installModals();
  const base=window.renderExpenses;
  if(typeof base==='function'&&!base.__accountingNotesWrapped){
    const wrapped=function(){
      const result=base.apply(this,arguments);
      render();
      return result;
    };
    wrapped.__accountingNotesWrapped=true;
    window.renderExpenses=wrapped;
  }
  render();
}

window.openAccountingNote=openNote;
window.deleteAccountingNote=deleteNote;
window.openAccountingPayment=openPayment;
window.deleteAccountingPayment=deletePayment;
window.renderAccountingNotes=render;
window.AccountingNotes={summary,totals,payments};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();