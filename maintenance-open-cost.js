/* Maintenance jobs may start with unknown final cost; payments remain real expenses. */
(()=>{
'use strict';
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const today=()=>window.isoToday?.()||new Date().toISOString().slice(0,10);
const parse=v=>window.ResortAccountCore?.parseMoney?.(v)??window.AdwaaNumberInput?.parseNumber?.(v,0)??Number(v||0);
const money=v=>window.money?.(Number(v||0))||Number(v||0).toLocaleString('ar-SA')+' ر.س';
const esc=v=>window.escapeHtml?.(String(v??''))||String(v??'');
function jobs(){if(!Array.isArray(db.maintenanceJobs))db.maintenanceJobs=[];return db.maintenanceJobs}
function exps(){if(!Array.isArray(db.expenses))db.expenses=[];return db.expenses}
function job(id){return jobs().find(x=>x.id===id)}
function paid(j){return (j?.payments||[]).reduce((s,p)=>s+Math.max(0,parse(p.amount)),0)}
function finalKnown(j){return j?.finalCostKnown===true||Number(j?.totalAmount)>0}
function expRef(){const n=exps().map(x=>Number(String(x.ref||'').match(/\d+/)?.[0]||0));return 'EXP-'+String(Math.max(0,...n)+1).padStart(4,'0')}
async function persist(modal){const ok=await window.persist?.();if(ok===false||window.__adwaaLastPersistResult?.ok===false)throw new Error('لم يتم تأكيد الحفظ');window.renderResortAccount?.();window.renderExpenses?.();window.renderAccountingNotes?.();if(modal)window.closeModal?.(modal)}
function prepareJobForm(){const old=document.getElementById('maintenanceJobForm');if(!old||old.dataset.openCost==='1')return;const total=old.elements.total;if(total){total.required=false;total.min='0';const label=total.closest('label');if(label){label.childNodes[0].textContent='التكلفة النهائية (اختياري)';const hint=document.createElement('div');hint.className='meta';hint.textContent='اتركها فارغة إذا لم تُعرف التكلفة بعد. يمكنك تحديدها عند انتهاء العمل.';label.append(hint)}}const fresh=old.cloneNode(true);fresh.dataset.openCost='1';old.replaceWith(fresh);fresh.addEventListener('submit',saveJob);window.AdwaaNumberInput?.scan?.(fresh)}
async function saveJob(e){e.preventDefault();const f=e.currentTarget,id=f.elements.id.value,j=id?job(id):null,p=paid(j),raw=String(f.elements.total.value||'').trim(),known=raw!==''&&parse(raw)>0,total=known?Math.max(0,parse(raw)):0;if(known&&total+0.009<p)return alert(`لا يمكن أن تكون التكلفة النهائية أقل من الدفعات السابقة (${money(p)}).`);const next={id:j?.id||uid(),title:String(f.elements.title.value||'').trim(),vendor:String(f.elements.vendor.value||'').trim(),totalAmount:total,finalCostKnown:known,date:f.elements.date.value||today(),note:String(f.elements.note.value||'').trim(),payments:Array.isArray(j?.payments)?j.payments:[],createdAt:j?.createdAt||now(),updatedAt:now()};if(!next.title||!next.vendor)return alert('أدخل اسم العمل والفني أو المستفيد.');if(j)Object.assign(j,next);else jobs().push(next);f.elements.id.value=next.id;window.addAudit?.(j?'تعديل':'إضافة','مستحق صيانة',`${next.title} — ${known?'التكلفة النهائية '+money(total):'التكلفة النهائية غير محددة'}`,j||null,next);await persist('maintenanceJobModal')}
function preparePaymentForm(){const old=document.getElementById('maintenancePaymentForm');if(!old||old.dataset.openCost==='1')return;const fresh=old.cloneNode(true);fresh.dataset.openCost='1';old.replaceWith(fresh);fresh.addEventListener('submit',savePayment);window.AdwaaNumberInput?.scan?.(fresh)}
async function savePayment(e){e.preventDefault();const f=e.currentTarget,j=job(f.elements.jobId.value);if(!j)return;const pid=f.elements.paymentId.value,value=Math.max(0,parse(f.elements.amount.value));if(!(value>0))return alert('أدخل مبلغ الدفعة.');const current=(j.payments||[]).map(x=>({...x,amount:Math.max(0,parse(x.amount))})),old=current.find(x=>x.id===pid)||null,other=current.filter(x=>x.id!==pid).reduce((s,x)=>s+x.amount,0);if(finalKnown(j)&&other+value>Number(j.totalAmount)+0.009)return alert(`الدفعة تتجاوز المتبقي. الحد الأعلى ${money(Math.max(0,Number(j.totalAmount)-other))}.`);const id=old?.id||uid(),linked=exps().filter(x=>x.maintenancePaymentId===id);if(linked.length>1)return alert('وجد النظام أكثر من مصروف مرتبط بهذه الدفعة. لم يتم التعديل لحماية الرصيد.');const exp=linked[0],expenseId=exp?.id||old?.expenseId||uid(),row={id,amount:value,date:f.elements.date.value||today(),note:String(f.elements.note.value||'').trim(),expenseId,createdAt:old?.createdAt||now(),updatedAt:now()},expense={id:expenseId,ref:exp?.ref||expRef(),title:`دفعة صيانة: ${j.title} — ${j.vendor}`,amount:value,date:row.date,cat:'صيانة',category:'صيانة',expenseType:'maintenance_payment',sourceType:'maintenance',maintenanceJobId:j.id,maintenancePaymentId:id,paymentMethod:exp?.paymentMethod||'غير محدد',externalRef:exp?.externalRef||'',notes:row.note,note:row.note,createdAt:exp?.createdAt||now(),updatedAt:now()};if(exp)Object.assign(exp,expense);else exps().push(expense);j.payments=old?current.map(x=>x.id===id?row:x):[...current,row];j.updatedAt=now();window.addAudit?.(old?'تعديل':'إضافة','دفعة صيانة',`${j.title} — ${money(value)}`,old,row);await persist('maintenancePaymentModal')}
function enhanceCards(){
 const list=document.getElementById('maintenanceList');if(!list)return;
 for(const card of list.querySelectorAll('.fo-card')){
  const edit=card.querySelector('button[onclick^="openMaintenanceJob"]'),m=edit?.getAttribute('onclick')?.match(/'([^']+)'/);
  if(!m)continue;const j=job(m[1]);if(!j||finalKnown(j))continue;
  // The observer sees our own writes too. Only change content that differs.
  const figs=card.querySelectorAll('.fo-figure');
  const values=[[figs[0],'<span>التكلفة النهائية</span><b>غير محددة بعد</b>'],[figs[2],'<span>المتبقي</span><b>يُحسب بعد تحديد النهائي</b>']];
  for(const [el,html] of values)if(el&&el.innerHTML!==html)el.innerHTML=html;
  const status=card.querySelector('.fo-status'),label='العمل مفتوح — التكلفة النهائية غير محددة';
  if(status&&status.textContent!==label)status.textContent=label;
  const add=card.querySelector('button[onclick^="openMaintenancePayment"]');
  if(!add)card.querySelector('.fo-actions')?.insertAdjacentHTML('afterbegin',`<button class="primary" type="button" onclick="openMaintenancePayment('${esc(j.id)}')">+ إضافة دفعة</button>`);
 }
}
const baseOpenJob=window.openMaintenanceJob;window.openMaintenanceJob=function(id=''){prepareJobForm();const j=id?job(id):null,f=document.getElementById('maintenanceJobForm');f.reset();f.elements.id.value=j?.id||'';f.elements.title.value=j?.title||'';f.elements.vendor.value=j?.vendor||'';f.elements.total.value=finalKnown(j)?j.totalAmount:'';f.elements.date.value=j?.date||today();f.elements.note.value=j?.note||'';document.getElementById('maintenanceJobModalTitle').textContent=j?'تعديل الصيانة':'صيانة/مستحق جديد';document.getElementById('maintenanceJobModal')?.classList.add('open');document.body.classList.add('modal-open')};
const baseOpenPayment=window.openMaintenancePayment;window.openMaintenancePayment=function(jobId,paymentId=''){preparePaymentForm();const j=job(jobId);if(!j)return;const p=(j.payments||[]).find(x=>x.id===paymentId),f=document.getElementById('maintenancePaymentForm');f.reset();f.elements.jobId.value=jobId;f.elements.paymentId.value=p?.id||'';f.elements.amount.value=p?.amount??'';f.elements.date.value=p?.date||today();f.elements.note.value=p?.note||'';document.getElementById('maintenancePaymentModalTitle').textContent=p?'تعديل دفعة الصيانة':'إضافة دفعة صيانة';document.getElementById('maintenancePaymentModal')?.classList.add('open');document.body.classList.add('modal-open')};
function install(){prepareJobForm();preparePaymentForm();enhanceCards();const list=document.getElementById('maintenanceList');if(list)new MutationObserver(enhanceCards).observe(list,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
})();
