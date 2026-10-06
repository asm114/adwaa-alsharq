/* Link existing expenses to maintenance jobs; never create a second money movement. */
(()=>{
'use strict';
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const parse=v=>window.ResortAccountCore?.parseMoney?.(v)??Number(v||0);
const money=v=>window.money?.(parse(v))||parse(v).toLocaleString('ar-SA')+' ر.س';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jobs=()=>Array.isArray(db.maintenanceJobs)?db.maintenanceJobs:[];
const exps=()=>Array.isArray(db.expenses)?db.expenses:[];
const job=id=>jobs().find(x=>x.id===id)||null;
const payment=(j,pid)=>(j?.payments||[]).find(x=>x.id===pid)||null;
let activeJobId='',busy=false,pending=null;
const selected=new Set();
function eligible(){
 const used=new Set([...jobs(),...(db.installmentPurchases||[])].flatMap(j=>(j.payments||[]).map(p=>p.expenseId)).filter(Boolean));
 const counts=new Map();for(const x of exps())counts.set(x.id,(counts.get(x.id)||0)+1);
 return exps().filter(x=>x.id&&counts.get(x.id)===1&&!used.has(x.id)&&
  !x.maintenanceJobId&&!x.maintenancePaymentId&&!x.maintenanceLinkedExisting&&
  !x.installmentPurchaseId&&!x.installmentPaymentId&&
  !['salary','maintenance_payment','installment_payment'].includes(x.expenseType)&&
  !['maintenance','installment_purchase'].includes(x.sourceType)&&!x.salaryMonth&&
  x.cat!=='راتب عامل'&&x.category!=='راتب عامل'&&Number.isFinite(parse(x.amount))&&parse(x.amount)>0);
}
function snapshot(){
 return {rows:JSON.stringify(exps().map(x=>[x.id,x.amount,x.date,x.createdAt,x.updatedAt])),
  count:exps().length,total:exps().reduce((s,x)=>s+parse(x.amount),0),balance:window.ResortAccountCore?.currentBalance?.(db)};
}
function assertUnchanged(before){
 const after=snapshot();
 if(before.rows!==after.rows||before.total!==after.total||before.balance!==after.balance)throw new Error('تغيرت حركة مالية أثناء الربط؛ أوقف النظام العملية.');
 return after;
}
async function persist(){
 if(typeof window.persist!=='function')throw new Error('خدمة الحفظ غير جاهزة');
 const previous=window.__adwaaLastPersistResult,ok=await window.persist();
 const result=window.__adwaaLastPersistResult;
 if(ok===false||(result!==previous&&result?.ok===false)||!(ok===true||(result!==previous&&result?.ok===true)))throw new Error('لم يتم تأكيد الحفظ');
 window.renderResortAccount?.();window.renderExpenses?.();window.renderAccountingNotes?.();
}
function status(message,error=false){
 const el=document.getElementById('maintenanceExpenseLinkStatus');
 el.textContent=message;el.style.color=error?'var(--danger)':'';
}
function installModal(){
 if(document.getElementById('maintenanceExpenseLinkModal'))return;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal fo-modal" id="maintenanceExpenseLinkModal" role="dialog" aria-modal="true" aria-labelledby="maintenanceExpenseLinkTitle"><div class="sheet"><div class="sheet-head"><h2 id="maintenanceExpenseLinkTitle">ربط مصاريف سابقة بالصيانة</h2><button class="close" aria-label="إغلاق النافذة" type="button" onclick="closeModal('maintenanceExpenseLinkModal')">×</button></div><div style="padding:14px 18px"><p id="maintenanceExpenseJobTitle"></p><div class="meta" style="margin-bottom:10px">اختر المصروف الذي يخص هذا العمل. الربط لا ينشئ مصروفًا جديدًا ولا يغير مبلغ المصروف أو تاريخه أو الرصيد.</div><label class="label" for="maintenanceExpenseSearch">البحث في المصروفات السابقة</label><input id="maintenanceExpenseSearch" placeholder="بحث بالعنوان أو التصنيف أو المبلغ" style="margin-bottom:10px"><div id="maintenanceExpenseCandidates" style="max-height:48vh;overflow:auto;-webkit-overflow-scrolling:touch;display:grid;gap:8px"></div><div id="maintenanceExpenseLinkSummary" class="meta" style="margin-top:10px"></div><div id="maintenanceExpenseLinkStatus" class="meta" role="status" aria-live="polite" style="margin-top:10px"></div><div class="actions"><button class="secondary" type="button" onclick="closeModal('maintenanceExpenseLinkModal')">إلغاء</button><button class="primary" id="confirmMaintenanceExpenseLinks" type="button">ربط المحدد</button></div></div></div></div>`);
 document.getElementById('maintenanceExpenseSearch').addEventListener('input',renderCandidates);
 document.getElementById('confirmMaintenanceExpenseLinks').addEventListener('click',confirmLinks);
}
function openLinker(jobId){
 if(busy)return;
 if(!job(jobId))return alert('تعذر العثور على سجل الصيانة. حدّث الصفحة ثم حاول مجددًا.');
 if(pending&&pending.jobId!==jobId)return alert('أعد محاولة حفظ الربط في سجل الصيانة السابق أولًا.');
 installModal();activeJobId=jobId;selected.clear();
 document.getElementById('maintenanceExpenseSearch').value='';
 document.getElementById('maintenanceExpenseJobTitle').textContent='سجل الصيانة: '+job(jobId).title;
 status(pending?'لم يتم تأكيد الحفظ السابق؛ أعد المحاولة لإكمال الربط دون تكرار.':'',!!pending);
 renderCandidates();document.getElementById('maintenanceExpenseLinkModal').classList.add('open');document.body.classList.add('modal-open');
}
function renderCandidates(){
 const box=document.getElementById('maintenanceExpenseCandidates');if(!box)return;
 const q=document.getElementById('maintenanceExpenseSearch').value.trim().toLowerCase();
 const candidates=eligible(),valid=new Set(candidates.map(x=>x.id));
 for(const id of selected)if(!valid.has(id))selected.delete(id);
 const rows=candidates.filter(x=>!q||`${x.title||''} ${x.cat||''} ${x.category||''} ${x.amount||''} ${x.date||''}`.toLowerCase().includes(q)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 box.innerHTML=pending?'<div class="notice">الربط موجود مؤقتًا على هذا الجهاز. اضغط إعادة محاولة الحفظ لتأكيد مزامنته.</div>':rows.map(x=>`<label style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff;flex-wrap:wrap"><input type="checkbox" class="maintenance-expense-choice" value="${esc(x.id)}" ${selected.has(x.id)?'checked':''} style="width:22px;min-width:22px;height:22px;margin-top:5px;flex:none"><span style="flex:1;min-width:100px;overflow-wrap:anywhere"><b>${esc(x.title||'مصروف')}</b><span class="meta" style="display:block">${esc(x.date||'—')} • التصنيف الحالي: ${esc(x.category||x.cat||'غير محدد')}</span></span><b class="money">${esc(money(x.amount))}</b></label>`).join('')||`<div class="empty">${candidates.length?'لا توجد مصروفات تطابق البحث.':'لا توجد مصروفات سابقة مؤهلة للربط. المصروفات المرتبطة بصيانة أو تقسيط آخر والرواتب لا تظهر هنا.'}</div>`;
 box.querySelectorAll('input').forEach(i=>i.addEventListener('change',()=>{if(i.checked)selected.add(i.value);else selected.delete(i.value);updateSummary()}));
 updateSummary();
}
function updateSummary(){
 const rows=exps().filter(x=>pending?pending.ids.includes(x.id):selected.has(x.id));
 document.getElementById('maintenanceExpenseLinkSummary').textContent=rows.length?`المحدد: ${rows.length} مصروف — ${money(rows.reduce((s,x)=>s+parse(x.amount),0))}. لن يتغير إجمالي المصروفات أو الرصيد.`:'لم تحدد أي مصروف بعد.';
 const button=document.getElementById('confirmMaintenanceExpenseLinks');button.disabled=busy||(!pending&&!selected.size);button.textContent=pending?'إعادة محاولة حفظ الربط':'ربط المحدد';
}
function setBusy(value){
 busy=value;const modal=document.getElementById('maintenanceExpenseLinkModal');
 modal.setAttribute('aria-busy',String(value));modal.querySelectorAll('button,input').forEach(el=>el.disabled=value);updateSummary();
}
async function confirmLinks(){
 if(busy)return;
 const j=job(activeJobId);if(!j)return status('تعذر العثور على سجل الصيانة. حدّث الصفحة.',true);
 let rows;
 if(!pending){
  rows=[...selected].map(id=>eligible().find(x=>x.id===id));
  if(!rows.length)return status('اختر مصروفًا واحدًا على الأقل.',true);
  if(rows.some(x=>!x)){renderCandidates();return status('أصبح أحد المصروفات غير مؤهل للربط. راجع الاختيار مجددًا.',true)}
  const paid=(j.payments||[]).reduce((s,p)=>s+parse(p.amount),0),total=rows.reduce((s,x)=>s+parse(x.amount),0);
  if((j.finalCostKnown===true||parse(j.totalAmount)>0)&&paid+total>parse(j.totalAmount)+.009)return status('المصروفات المحددة تتجاوز المتبقي من تكلفة الصيانة. اختر مصروفًا مناسبًا أو راجع التكلفة النهائية.',true);
  if(!confirm(`ربط ${rows.length} مصروف بعمل «${j.title}» بإجمالي ${money(total)}؟ لن يتغير مبلغ المصروف أو تاريخه أو الرصيد.`))return;
 }
 setBusy(true);status('جاري حفظ الربط…');
 try{
  if(!pending){
   const before=snapshot(),oldPayments=j.payments,oldUpdated=j.updatedAt;
   const originals=rows.map(x=>({...x}));
   try{
    const ps=rows.map(x=>({id:uid(),amount:parse(x.amount),date:x.date||'',note:x.notes||x.note||'',expenseId:x.id,linkedExistingExpense:true,createdAt:now(),updatedAt:now()}));
    j.payments=[...(j.payments||[]),...ps];j.updatedAt=now();
    rows.forEach((x,i)=>{x.maintenanceJobId=j.id;x.maintenancePaymentId=ps[i].id;x.maintenanceLinkedExisting=true});
    assertUnchanged(before);
   }catch(error){
    j.payments=oldPayments;j.updatedAt=oldUpdated;
    rows.forEach((x,i)=>{for(const key of Object.keys(x))delete x[key];Object.assign(x,originals[i])});throw error;
   }
   pending={jobId:j.id,ids:rows.map(x=>x.id)};
   window.addAudit?.('ربط','مصروفات سابقة بالصيانة',`${j.title} — ${rows.length} مصروف`,null,{jobId:j.id,expenseIds:pending.ids});
  }
  // A failed request may already have saved locally. Retry the same IDs, never add another payment.
  const live=job(pending.jobId);
  if(!pending.ids.every(id=>{const x=exps().find(e=>e.id===id),p=(live?.payments||[]).find(p=>p.expenseId===id);return x&&p&&x.maintenanceJobId===live.id&&x.maintenancePaymentId===p.id}))throw new Error('تغيرت بيانات الربط؛ حدّث الصفحة وراجع سجل الصيانة قبل المحاولة.');
  await persist();pending=null;selected.clear();status('تم ربط المصروفات بنجاح دون إنشاء مصروف أو خصم جديد.');
  window.closeModal?.('maintenanceExpenseLinkModal');
 }catch(error){status('تعذر تأكيد حفظ الربط. أعد المحاولة من هذه النافذة دون تكرار المصروف. '+String(error?.message||''),true)}
 finally{setBusy(false);renderCandidates()}
}
function enhance(){
 const list=document.getElementById('maintenanceList');if(!list)return;
 for(const card of list.querySelectorAll('.fo-card')){
  const edit=card.querySelector('button[onclick^="openMaintenanceJob"]'),m=edit?.getAttribute('onclick')?.match(/'([^']+)'/);
  if(!m)continue;
  for(const row of card.querySelectorAll('.fo-payment')){
   const remove=row.querySelector('button[onclick^="deleteMaintenancePayment"]'),ids=remove?.getAttribute('onclick')?.match(/'([^']+)'\s*,\s*'([^']+)'/);
   if(ids&&payment(job(ids[1]),ids[2])?.linkedExistingExpense){
    if(remove.textContent!=='فك الربط')remove.textContent='فك الربط';
    if(!row.querySelector('.maintenance-existing-label')){const label=document.createElement('span');label.className='meta maintenance-existing-label';label.textContent=' • مصروف سابق مرتبط';row.querySelector('.meta')?.append(label)}
   }
  }
  if(card.querySelector('.link-existing-expenses'))continue;
  const button=document.createElement('button');button.className='secondary link-existing-expenses';button.type='button';button.textContent='ربط مصاريف سابقة';button.addEventListener('click',()=>openLinker(m[1]));card.querySelector('.fo-actions')?.prepend(button);
 }
}
const originalDelete=window.deleteMaintenancePayment;
window.deleteMaintenancePayment=async function(jobId,pid){
 const j=job(jobId),p=payment(j,pid);if(!p?.linkedExistingExpense)return originalDelete?.(jobId,pid);
 if(busy||pending)return alert('أكمل حفظ الربط الحالي أولًا.');
 const x=exps().find(e=>e.id===p.expenseId);
 if(!x||x.maintenanceJobId!==j.id||x.maintenancePaymentId!==pid)return alert('تعذر التحقق من المصروف الأصلي؛ لم يتغير شيء.');
 if(!confirm(`فك ربط ${money(p.amount)} من الصيانة؟ سيبقى المصروف والرصيد كما هما.`))return;
 const before=snapshot(),oldExpense={...x},oldPayments=j.payments,oldUpdated=j.updatedAt;
 busy=true;
 try{
  // Older links stored the original classification; restore it without changing financial timestamps.
  const o=p.originalExpense||x.originalMaintenanceLink;
  if(o)for(const k of ['title','cat','category','expenseType','sourceType','notes','note']){if(Object.prototype.hasOwnProperty.call(o,k))x[k]=o[k];else delete x[k]}
  for(const k of ['maintenanceJobId','maintenancePaymentId','maintenanceLinkedExisting','originalMaintenanceLink'])delete x[k];
  j.payments=j.payments.filter(r=>r.id!==pid);j.updatedAt=now();assertUnchanged(before);
  window.addAudit?.('فك ربط','مصروف سابق من الصيانة',j.title,p,null);await persist();
 }catch(error){
  for(const k of Object.keys(x))delete x[k];Object.assign(x,oldExpense);j.payments=oldPayments;j.updatedAt=oldUpdated;
  // Keep the restored local link consistent with the app's local persistence on failure.
  try{localStorage.setItem('adwaaDB',JSON.stringify(db))}catch(_){}
  window.renderAccountingNotes?.();alert('تعذر تأكيد فك الربط. بقي المصروف دون حذف أو تغيير مبلغ؛ أعد المحاولة. '+String(error?.message||''));
 }finally{busy=false}
};
const originalOpen=window.openMaintenancePayment;
window.openMaintenancePayment=function(jobId,pid=''){
 if(pid&&payment(job(jobId),pid)?.linkedExistingExpense)return alert('هذه دفعة مرتبطة بمصروف سابق. لحماية الحسابات لا يُعدل مبلغها من الصيانة؛ يمكنك فك الربط أولًا.');
 return originalOpen?.(jobId,pid);
};
// The existing ordinary-expense wrapper calls a lexical payment editor; guard that entry point too.
const originalExpenseOpen=window.openExpense;
window.openExpense=function(id){
 const x=exps().find(e=>e.id===id);
 if(x?.maintenanceLinkedExisting||payment(job(x?.maintenanceJobId),x?.maintenancePaymentId)?.linkedExistingExpense)return window.openMaintenancePayment(x.maintenanceJobId,x.maintenancePaymentId);
 return originalExpenseOpen?.apply(this,arguments);
};
window.openMaintenanceExpenseLinker=openLinker;
function install(){installModal();enhance();const list=document.getElementById('maintenanceList');if(list)new MutationObserver(enhance).observe(list,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
