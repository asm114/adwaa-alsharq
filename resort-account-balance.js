(()=>{
'use strict';
if(window.__adwaaResortAccountBalanceInstalled)return;
window.__adwaaResortAccountBalanceInstalled=true;

const Core=window.ResortAccountCore;
if(!Core){console.warn('تعذر تحميل نواة رصيد المنتجع');return}

let renderWrapTarget=null;

const dbState=()=>window.db||null;
const money=value=>typeof window.money==='function'?window.money(value):`${Number(value||0).toLocaleString('ar-SA')} ر.س`;
const esc=value=>typeof window.escapeHtml==='function'?window.escapeHtml(String(value??'')):String(value??'');
const today=()=>typeof window.isoToday==='function'?window.isoToday():new Date().toISOString().slice(0,10);
const now=()=>new Date().toISOString();
const userLabel=()=>typeof window.currentUserLabel==='function'?window.currentUserLabel():'';
const uuid=()=>crypto.randomUUID();

function account(){
  const db=dbState();if(!db)return Core.normalizeAccount(null);
  db.resortAccount=Core.normalizeAccount(db.resortAccount);
  return db.resortAccount;
}
function periodMatch(date){
  const period=document.getElementById('financePeriod')?.value||'month';
  if(typeof window.financeDateMatch==='function')return window.financeDateMatch(date,period);
  if(period==='all')return true;
  const current=today(),value=String(date||'');
  if(period==='month')return value.slice(0,7)===current.slice(0,7);
  if(period==='year')return value.slice(0,4)===current.slice(0,4);
  return true;
}
function sourceLabel(row){
  const labels={
    booking_payment:'دفعة حجز',
    subscription_payment:'دفعة اشتراك',
    expense:'مصروف',
    customer_refund:'استرداد عميل',
    commission_transfer:'تحويل عمولة',
    personal_advance:'سلفة من المنتجع',
    advance_repayment:'سداد سلفة',
    manual_in:'إيداع يدوي',
    manual_out:'سحب يدوي'
  };
  return labels[row.kind]||row.source||'حركة';
}
function isCalibrated(){return !!account().calibration?.at}

function installStyles(){
  if(document.getElementById('resortAccountBalanceStyles'))return;
  const style=document.createElement('style');style.id='resortAccountBalanceStyles';style.textContent=`
  .resort-account-hero{margin:0 18px 14px;padding:18px;border-radius:20px;background:linear-gradient(135deg,#073f35,#0f6655);color:#fff;display:grid;grid-template-columns:1.3fr .7fr;gap:14px;align-items:center}
  .resort-account-hero small{display:block;color:#cfe4dc;margin-bottom:5px}.resort-account-balance{font-size:34px;font-weight:950}
  .resort-account-hero .actions{justify-content:flex-end;margin:0}.resort-account-hero .secondary{background:#ffffff14;color:#fff;border-color:#ffffff55}
  .resort-account-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:0 18px 14px}
  .resort-account-stat{border:1px solid var(--line);background:#f8faf9;border-radius:14px;padding:12px}.resort-account-stat span{display:block;color:var(--muted);font-size:12px}.resort-account-stat b{display:block;margin-top:5px;font-size:18px}
  .resort-account-status{margin:0 18px 12px}.resort-account-ledger{overflow:auto;margin:0 18px 18px}.resort-account-ledger table{width:100%;border-collapse:collapse;min-width:780px}
  .resort-account-ledger th,.resort-account-ledger td{padding:10px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}.resort-account-ledger th{background:#f8faf9;color:var(--muted);font-size:12px}
  .resort-account-in{color:#14785f;font-weight:900}.resort-account-out{color:#b13b3b;font-weight:900}.resort-account-modal .sheet{max-width:620px;margin:auto}
  .finance-integrity-ok{background:#eef9f3;border-color:#add9c5;color:#17664f}.finance-integrity-warn{background:#fff8e7;border-color:#f0d494;color:#76520b}
  @media(max-width:720px){.resort-account-hero{grid-template-columns:1fr}.resort-account-hero .actions{justify-content:flex-start}.resort-account-stats{grid-template-columns:1fr}.resort-account-balance{font-size:29px}}
  `;document.head.appendChild(style);
}

function ensureFinanceCards(){
  const summary=document.querySelector('#expenses .finance-summary');if(!summary)return;
  if(!document.getElementById('finAvailableBalance')){
    const card=document.createElement('div');card.className='finance-card';card.innerHTML='<small>الرصيد المتاح في حساب المنتجع</small><div class="amount resort-account-money" id="finAvailableBalance">0 ر.س</div>';
    const cash=document.getElementById('finCashCollected')?.closest('.finance-card');cash?.after(card)||summary.prepend(card);
  }
  if(!document.getElementById('finCashOutflow')){
    const card=document.createElement('div');card.className='finance-card';card.innerHTML='<small>الخارج من حساب المنتجع</small><div class="amount finance-negative resort-account-money" id="finCashOutflow">0 ر.س</div>';
    summary.appendChild(card);
  }
  const cashLabel=document.getElementById('finCashCollected')?.closest('.finance-card')?.querySelector('small');
  if(cashLabel)cashLabel.textContent='النقد المحصل من العملاء';
}

function ensureSection(){
  const finance=document.getElementById('expenses');if(!finance||document.getElementById('resortAccountSection'))return;
  const section=document.createElement('div');section.className='section';section.id='resortAccountSection';
  section.innerHTML=`
    <div class="section-head">
      <div><h3>🏦 حساب المنتجع</h3><div class="meta">الرصيد الفعلي يتغير تلقائيًا مع التحصيل والمصروفات والاستردادات والعمولات والسلف.</div></div>
      <button class="primary" type="button" onclick="openResortManualMovement()">+ حركة يدوية</button>
    </div>
    <div class="resort-account-hero">
      <div><small>الرصيد المتاح الآن</small><div id="resortAccountBalance" class="resort-account-balance resort-account-money">0 ر.س</div><div id="resortAccountCalibrationText" style="margin-top:6px;color:#d7ebe4;font-size:12px"></div></div>
      <div class="actions"><button class="secondary" type="button" onclick="openResortBalanceCalibration()">ضبط الرصيد الحالي</button></div>
    </div>
    <div class="resort-account-stats">
      <div class="resort-account-stat"><span>الداخل منذ آخر ضبط</span><b id="resortAccountInflow" class="resort-account-in resort-account-money">0 ر.س</b></div>
      <div class="resort-account-stat"><span>الخارج منذ آخر ضبط</span><b id="resortAccountOutflow" class="resort-account-out resort-account-money">0 ر.س</b></div>
      <div class="resort-account-stat"><span>السلف القائمة عليك</span><b id="resortAccountAdvances" class="resort-account-money">0 ر.س</b></div>
    </div>
    <div id="resortAccountIntegrity" class="notice resort-account-status"></div>
    <div class="resort-account-ledger"><table><thead><tr><th>التاريخ</th><th>الحركة</th><th>البيان</th><th>داخل</th><th>خارج</th><th>الإجراء</th></tr></thead><tbody id="resortAccountLedgerBody"></tbody></table></div>
  `;
  const accounting=document.getElementById('accountingNotesSection');
  if(accounting)finance.insertBefore(section,accounting);else{
    const chart=finance.querySelector('#financeChart')?.closest('.section');
    chart?finance.insertBefore(section,chart):finance.appendChild(section);
  }
}

function ensureModals(){
  if(!document.getElementById('resortBalanceCalibrationModal')){
    const modal=document.createElement('div');modal.id='resortBalanceCalibrationModal';modal.className='modal resort-account-modal';
    modal.innerHTML=`<div class="sheet"><div class="sheet-head"><h2>ضبط رصيد حساب المنتجع</h2><button class="close" type="button" onclick="closeModal('resortBalanceCalibrationModal')">×</button></div>
      <div class="notice">اكتب <b>الرصيد الموجود فعليًا الآن</b> في حساب/صندوق المنتجع. من لحظة الحفظ سيحسب النظام كل حركة جديدة فوق هذا الرصيد، ولن تعيد الحركات القديمة احتساب نفسها مرة ثانية.</div>
      <form id="resortBalanceCalibrationForm"><div class="form-grid">
        <label>الرصيد الحالي الفعلي<input name="balance" type="number" step="0.01" inputmode="decimal" required></label>
        <label class="full">ملاحظة<textarea name="note" maxlength="500" placeholder="مثال: مطابق لرصيد حساب المنتجع بتاريخ اليوم"></textarea></label>
      </div><div class="actions"><button class="secondary" type="button" onclick="closeModal('resortBalanceCalibrationModal')">إلغاء</button><button class="primary" type="submit">اعتماد الرصيد الحالي</button></div></form>
    </div>`;
    document.body.appendChild(modal);modal.querySelector('form').addEventListener('submit',saveCalibration);
  }
  if(!document.getElementById('resortManualMovementModal')){
    const modal=document.createElement('div');modal.id='resortManualMovementModal';modal.className='modal resort-account-modal';
    modal.innerHTML=`<div class="sheet"><div class="sheet-head"><h2 id="resortManualMovementTitle">حركة رصيد يدوية</h2><button class="close" type="button" onclick="closeModal('resortManualMovementModal')">×</button></div>
      <form id="resortManualMovementForm"><input type="hidden" name="id"><div class="form-grid">
        <label>نوع الحركة<select name="direction"><option value="in">إيداع / إضافة للحساب</option><option value="out">سحب / خصم من الحساب</option></select></label>
        <label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
        <label>التاريخ<input name="date" type="date" required></label>
        <label class="full">البيان<textarea name="note" maxlength="500" required placeholder="مثال: إيداع دعم للتشغيل"></textarea></label>
      </div><div class="actions"><button class="secondary" type="button" onclick="closeModal('resortManualMovementModal')">إلغاء</button><button class="primary" type="submit">حفظ الحركة</button></div></form>
    </div>`;
    document.body.appendChild(modal);modal.querySelector('form').addEventListener('submit',saveManualMovement);
  }
}

function outstandingAdvances(){
  return (dbState()?.accountingNotes||[]).reduce((sum,n)=>{
    const s=window.AccountingNotes?.summary?.(n);
    if(s)return sum+Number(s.remaining||0);
    const principal=Number(n?.principalAmount||0),paid=(n?.payments||[]).reduce((x,p)=>x+Number(p?.amount||0),0);
    return sum+Math.max(0,principal-paid);
  },0);
}
function render(){
  const db=dbState();if(!db)return;
  ensureFinanceCards();ensureSection();ensureModals();
  const details=Core.balanceDetails(db),issues=Core.integrityIssues(db),cal=details.calibration;
  const balanceEl=document.getElementById('resortAccountBalance'),available=document.getElementById('finAvailableBalance');
  if(balanceEl)balanceEl.textContent=money(details.balance);if(available){available.textContent=money(details.balance);available.className='amount resort-account-money '+(details.balance>=0?'finance-positive':'finance-negative')}
  const inflow=document.getElementById('resortAccountInflow'),outflow=document.getElementById('resortAccountOutflow'),advances=document.getElementById('resortAccountAdvances');
  if(inflow)inflow.textContent=money(details.inflow);if(outflow)outflow.textContent=money(details.outflow);if(advances)advances.textContent=money(outstandingAdvances());
  const calText=document.getElementById('resortAccountCalibrationText');
  if(calText)calText.textContent=cal?.at?`آخر ضبط للرصيد: ${new Date(cal.at).toLocaleString('ar-SA')} — ${money(cal.balance)}`:'لم يتم ضبط رصيد فعلي بعد؛ الرقم الحالي محسوب من السجلات ابتداءً من صفر.';
  const integrity=document.getElementById('resortAccountIntegrity');
  if(integrity){integrity.className='notice resort-account-status '+(issues.length?'finance-integrity-warn':'finance-integrity-ok');integrity.innerHTML=issues.length?`<b>⚠️ فحص مالي: ${issues.length} ملاحظة تحتاج مراجعة</b><br>${issues.slice(0,4).map(x=>esc(x.message)).join('<br>')}`:'<b>✅ الفحص المالي سليم</b><br>الدفعات والمصروفات والسلف والاستردادات مترابطة بدون تعارض ظاهر.'}

  const customerCash=Core.customerCashCollected(db,date=>periodMatch(date));
  const outPeriod=Core.cashOutflow(db,date=>periodMatch(date));
  const cash=document.getElementById('finCashCollected'),outCard=document.getElementById('finCashOutflow');
  if(cash)cash.textContent=money(customerCash);if(outCard)outCard.textContent=money(outPeriod);

  const rows=[...details.movements].sort((a,b)=>String(b.at||b.date).localeCompare(String(a.at||a.date))).slice(0,100);
  const body=document.getElementById('resortAccountLedgerBody');
  if(body)body.innerHTML=rows.length?rows.map(row=>`<tr><td>${esc(row.date||'—')}</td><td><b>${esc(sourceLabel(row))}</b></td><td>${esc(row.label||'—')}${row.method?`<div class="meta">${esc(row.method)}</div>`:''}</td><td class="resort-account-in resort-account-money">${row.amount>0?money(row.amount):'—'}</td><td class="resort-account-out resort-account-money">${row.amount<0?money(Math.abs(row.amount)):'—'}</td><td>${row.editable?`<button class="secondary small" type="button" onclick="openResortManualMovement('${esc(row.sourceId)}')">تعديل</button> <button class="danger small" type="button" onclick="deleteResortManualMovement('${esc(row.sourceId)}')">حذف</button>`:'<span class="meta">من المصدر</span>'}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">لا توجد حركات مؤثرة على الرصيد بعد آخر ضبط.</td></tr>';
}

function openCalibration(){
  ensureModals();const modal=document.getElementById('resortBalanceCalibrationModal'),form=document.getElementById('resortBalanceCalibrationForm');
  form.reset();form.elements.balance.value=String(Core.currentBalance(dbState()).toFixed(2));form.elements.note.value='';
  modal.classList.add('open');document.body.classList.add('modal-open');
}
async function saveCalibration(event){
  event.preventDefault();const form=event.currentTarget,target=Number(form.elements.balance.value);
  if(!Number.isFinite(target)){alert('أدخل رصيدًا صحيحًا.');return}
  const before=account().calibration?{...account().calibration}:null;
  account().calibration={balance:target,at:now(),note:String(form.elements.note.value||'').trim(),user:userLabel()};
  if(typeof window.addAudit==='function')window.addAudit('ضبط','رصيد حساب المنتجع',`اعتماد الرصيد الحالي ${money(target)}`,before,account().calibration);
  if(typeof window.persist==='function')await window.persist();window.closeModal?.('resortBalanceCalibrationModal');render();
}
function openManual(id=''){
  ensureModals();const form=document.getElementById('resortManualMovementForm'),row=account().manualMovements.find(x=>x.id===id)||null;
  form.reset();form.elements.id.value=row?.id||'';form.elements.direction.value=row?.direction||'in';form.elements.amount.value=row?.amount??'';form.elements.date.value=row?.date||today();form.elements.note.value=row?.note||'';
  document.getElementById('resortManualMovementTitle').textContent=row?'تعديل حركة الرصيد':'إضافة حركة رصيد يدوية';
  document.getElementById('resortManualMovementModal').classList.add('open');document.body.classList.add('modal-open');
}
async function saveManualMovement(event){
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value,amount=Math.max(0,Number(form.elements.amount.value||0));
  if(!(amount>0)){alert('أدخل مبلغًا أكبر من صفر.');return}
  const rows=account().manualMovements,old=rows.find(x=>x.id===id)||null;
  const next={id:old?.id||uuid(),direction:form.elements.direction.value==='out'?'out':'in',amount,date:form.elements.date.value||today(),note:String(form.elements.note.value||'').trim(),createdAt:old?.createdAt||now(),updatedAt:now()};
  if(!next.note){alert('اكتب بيان الحركة.');return}
  if(old)Object.assign(old,next);else rows.push(next);
  if(typeof window.addAudit==='function')window.addAudit(old?'تعديل':'إضافة','حركة رصيد المنتجع',`${next.direction==='out'?'سحب':'إيداع'} ${money(amount)} — ${next.note}`,old?{...old}:null,next);
  if(typeof window.persist==='function')await window.persist();window.closeModal?.('resortManualMovementModal');render();
}
async function deleteManual(id){
  const row=account().manualMovements.find(x=>x.id===id);if(!row||!confirm(`حذف حركة ${money(row.amount)}؟`))return;
  account().manualMovements=account().manualMovements.filter(x=>x.id!==id);
  if(typeof window.addAudit==='function')window.addAudit('حذف','حركة رصيد المنتجع',`${row.direction==='out'?'سحب':'إيداع'} ${money(row.amount)} — ${row.note}`,row,null);
  if(typeof window.persist==='function')await window.persist();render();
}

async function repairFinanceOnce(){
  const db=dbState();if(!db)return false;const acc=account();if(acc.financialRepairVersion>=1)return false;
  let changed=false;
  for(const booking of (db.bookings||[])){
    const payments=Array.isArray(booking?.payments)?booking.payments:[];
    const credit=Math.max(0,Number(booking?.customerCreditApplied||0));
    if(payments.length===1&&credit>0&&payments[0]?.type==='legacy'&&String(payments[0]?.note||'').includes('مبلغ مسجل قبل إضافة سجل الدفعات')){
      const oldAmount=Math.max(0,Number(payments[0].amount||0)),paid=Math.max(0,Number(booking.paid||0));
      if(Math.abs(oldAmount-paid)<=0.01&&oldAmount>=credit){
        payments[0].amount=Math.max(0,oldAmount-credit);payments[0].note='مبلغ نقدي مسجل قبل إضافة سجل الدفعات';changed=true;
      }
    }
    if(payments.length){
      const cash=payments.reduce((sum,row)=>sum+Math.max(0,Number(row?.amount||0)),0),expected=cash+credit,current=Math.max(0,Number(booking?.paid||0));
      if(Math.abs(expected-current)>0.01){
        const before=current;booking.paid=expected;changed=true;
        if(typeof window.addAudit==='function')window.addAudit('تصحيح آلي','إجمالي سداد حجز',`#${booking.code||''}: ${money(before)} ← ${money(expected)}`,{paid:before},{paid:expected,cash,customerCreditApplied:credit});
      }
    }
  }
  acc.financialRepairVersion=1;
  if(typeof window.addAudit==='function')window.addAudit('فحص','المنظومة المالية',changed?'تم تصحيح توافق الدفعات مع أرصدة العملاء':'تم التحقق من توافق الدفعات مع أرصدة العملاء',null,{financialRepairVersion:1});
  if(typeof window.persist==='function')await window.persist();
  window.dispatchEvent(new Event('adwaa-finance-repaired'));
  return true;
}

function wrapRenderExpenses(){
  const current=window.renderExpenses;
  if(typeof current!=='function'||current===renderWrapTarget||current.__resortBalanceWrapped)return;
  const wrapped=function(...args){const result=current.apply(this,args);queueMicrotask(render);return result};
  wrapped.__resortBalanceWrapped=true;wrapped.__base=current;renderWrapTarget=wrapped;
  try{renderExpenses=wrapped}catch(_){}
  window.renderExpenses=wrapped;
}
async function initialize(){
  installStyles();ensureFinanceCards();ensureSection();ensureModals();wrapRenderExpenses();
  try{await repairFinanceOnce()}catch(error){console.warn('تعذر تنفيذ فحص التوافق المالي',error)}
  render();
  let tries=0;const timer=setInterval(()=>{tries++;wrapRenderExpenses();ensureFinanceCards();ensureSection();render();if(tries>=20)clearInterval(timer)},500);
}
window.openResortBalanceCalibration=openCalibration;
window.openResortManualMovement=openManual;
window.deleteResortManualMovement=deleteManual;
window.renderResortAccount=render;
window.ResortAccountBalance={render,repairFinanceOnce};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(initialize,0),{once:true});else setTimeout(initialize,0);
window.addEventListener('adwaa-subscription-updated',()=>setTimeout(render,0));
window.addEventListener('adwaa-finance-repaired',()=>setTimeout(render,0));
})();