(()=>{
'use strict';
if(window.__adwaaDataProtectionStatusClarityInstalled)return;
window.__adwaaDataProtectionStatusClarityInstalled=true;

function installStyles(){
  if(document.getElementById('dataProtectionStatusClarityStyle'))return;
  const style=document.createElement('style');
  style.id='dataProtectionStatusClarityStyle';
  style.textContent=`
    .protection-status-reason{display:none;margin-top:8px;font-size:12px;font-weight:750;line-height:1.75;color:#8a6100;white-space:normal}
    .protection-status-reason.show{display:block}
    .protection-status-reason.error{color:#a63c3c}
    .protection-level .protection-status-reason{color:#ffe8a8;text-align:center}
    .protection-level .protection-status-reason.error{color:#ffd0d0}
    .protection-review-summary{display:none;margin:12px 0 0;padding:13px 14px;border-radius:15px;border:1px solid #e5c66f;background:#fff7df;color:#76520b;font-size:13px;line-height:1.8}
    .protection-review-summary.show{display:block}
    .protection-review-summary.error{border-color:#e0aaaa;background:#fff0f0;color:#923d3d}
    .protection-review-summary b{display:block;margin-bottom:5px}
    .protection-review-summary ul{margin:0;padding-inline-start:20px}
    .protection-review-summary li+li{margin-top:4px}
  `;
  document.head.appendChild(style);
}

function formatLocalDate(value){
  try{return new Date(value).toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'})}catch(_){return String(value||'')}
}
function reasonNode(targetId){
  const target=document.getElementById(targetId);if(!target)return null;
  const key=`protectionReason-${targetId}`;
  let node=document.getElementById(key);
  if(!node){node=document.createElement('small');node.id=key;node.className='protection-status-reason';target.insertAdjacentElement('afterend',node)}
  return node;
}
function setReason(targetId,text='',severity='warn'){
  const node=reasonNode(targetId);if(!node)return;
  const value=String(text||'').trim();
  node.textContent=value;
  node.className=`protection-status-reason${value?' show':''}${value&&severity==='error'?' error':''}`;
}

async function protectionLevelReason(){
  const rows=[...((window.db?.backupHistory)||[])].filter(row=>row?.createdAt).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest=rows[0]||null;
  if(!latest)return {severity:'warn',text:'لا توجد نسخة احتياطية مسجلة. أنشئ نقطة استعادة قبل أي تغيير مهم.'};
  if(latest.verified===false||latest.status==='فاشلة')return {severity:'error',text:`آخر نسخة (${formatLocalDate(latest.createdAt)}) لم تجتز فحص السلامة. أنشئ نسخة جديدة ولا تعتمد عليها للاستعادة.`};
  let available=false;
  try{
    if(typeof backupVaultAvailability==='function'&&latest.id){const map=await backupVaultAvailability([latest.id]);available=!!map?.[latest.id]}
  }catch(_){}
  if(!available){
    const location=String(latest.location||'').trim();
    return {severity:'warn',text:`آخر نسخة (${formatLocalDate(latest.createdAt)})${location?` مسجلة في «${location}»`:''}، لكنها غير موجودة داخل مخزن النسخ الآمن في هذا المتصفح على هذا الجهاز. لذلك لا يستطيع النظام تأكيد إمكانية الاستعادة تلقائيًا. أنشئ نسخة جديدة من هذا الجهاز أو افحص ملف النسخة المحفوظة.`};
  }
  const age=(Date.now()-new Date(latest.createdAt).getTime())/86400000;
  if(Number.isFinite(age)&&age>7)return {severity:'warn',text:`آخر نسخة متاحة على هذا الجهاز أقدم من 7 أيام (${formatLocalDate(latest.createdAt)}). أنشئ نسخة حديثة.`};
  return {severity:'ok',text:''};
}

function systemStatusReason(){
  try{
    if(typeof runSystemHealthChecks!=='function')return {severity:'warn',text:'تعذر قراءة تفاصيل فحص النظام الآن.'};
    const report=runSystemHealthChecks();
    const notable=(report?.results||[]).filter(item=>item?.severity&&item.severity!=='ok');
    if(!notable.length)return {severity:'ok',text:''};
    const severity=notable.some(item=>item.severity==='error')?'error':'warn';
    const visible=notable.slice(0,5).map(item=>`${item.label}${item.message?` — ${item.message}`:''}`);
    if(notable.length>visible.length)visible.push(`وهناك ${notable.length-visible.length} تنبيه آخر داخل تفاصيل فحص النظام.`);
    return {severity,text:visible.join(' • ')};
  }catch(error){return {severity:'warn',text:`تعذر استخراج سبب حالة النظام: ${String(error?.message||error||'خطأ غير معروف')}`}}
}

function syncStatusReason(){
  const target=document.getElementById('protectionSyncStatus');if(!target)return {severity:'ok',text:''};
  const text=String(target.textContent||'');
  if(text.includes('🟢'))return {severity:'ok',text:''};
  const reason=String(target.title||'').trim()||'لم يتم تأكيد تطابق البيانات المحلية مع آخر حالة مؤكدة في Supabase.';
  return {severity:text.includes('🔴')?'error':'warn',text:reason};
}

function renderSummary(reasons){
  const hero=document.querySelector('.protection-hero');if(!hero)return;
  let box=document.getElementById('protectionReviewSummary');
  if(!box){box=document.createElement('div');box.id='protectionReviewSummary';box.className='protection-review-summary';hero.insertAdjacentElement('afterend',box)}
  const active=reasons.filter(item=>item.reason.text);
  if(!active.length){box.className='protection-review-summary';box.replaceChildren();return}
  box.className=`protection-review-summary show${active.some(item=>item.reason.severity==='error')?' error':''}`;
  const title=document.createElement('b');title.textContent='سبب أن الحالة تحتاج مراجعة:';
  const list=document.createElement('ul');
  active.forEach(item=>{const li=document.createElement('li');li.textContent=`${item.label}: ${item.reason.text}`;list.appendChild(li)});
  box.replaceChildren(title,list);
}

async function renderProtectionReasons(){
  installStyles();
  const level=await protectionLevelReason(),system=systemStatusReason(),sync=syncStatusReason();
  setReason('protectionLevel',level.text,level.severity);
  setReason('protectionSystemStatus',system.text,system.severity);
  setReason('protectionSyncStatus',sync.text,sync.severity);
  renderSummary([
    {label:'مستوى الحماية',reason:level},
    {label:'حالة النظام',reason:system},
    {label:'حالة المزامنة',reason:sync}
  ]);
}

function wrapAsyncRenderer(){
  if(typeof window.renderDataProtectionCenter!=='function'||window.renderDataProtectionCenter.__statusClarityWrapped)return;
  const original=window.renderDataProtectionCenter;
  const wrapped=async function(...args){const result=await original.apply(this,args);await renderProtectionReasons();return result};
  wrapped.__statusClarityWrapped=true;wrapped.__base=original;
  try{renderDataProtectionCenter=wrapped}catch(_){}
  window.renderDataProtectionCenter=wrapped;
}
function wrapSystemRenderer(){
  if(typeof window.renderSystemHealth!=='function'||window.renderSystemHealth.__statusClarityWrapped)return;
  const original=window.renderSystemHealth;
  const wrapped=function(...args){const result=original.apply(this,args);queueMicrotask(()=>renderProtectionReasons());return result};
  wrapped.__statusClarityWrapped=true;wrapped.__base=original;
  try{renderSystemHealth=wrapped}catch(_){}
  window.renderSystemHealth=wrapped;
}
function install(){wrapAsyncRenderer();wrapSystemRenderer();renderProtectionReasons().catch(()=>{})}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,700);
window.renderDataProtectionStatusReasons=()=>renderProtectionReasons();
})();
