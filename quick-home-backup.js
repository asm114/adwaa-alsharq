(()=>{
'use strict';
if(window.__adwaaQuickHomeBackupInstalled)return;
window.__adwaaQuickHomeBackupInstalled=true;

function addStyles(){
  if(document.getElementById('quickHomeBackupStyle'))return;
  const style=document.createElement('style');
  style.id='quickHomeBackupStyle';
  style.textContent=`
    .quick-backup-btn{position:relative;background:#fff!important;color:#6754df!important;border:1px solid #dedaf5!important;box-shadow:0 7px 18px rgba(31,42,68,.08)!important}
    .quick-backup-btn.busy{opacity:.65;pointer-events:none}
    .quick-backup-btn.ok{background:#eaf7f1!important;color:#14785f!important;border-color:#b9dfcf!important}
    .quick-backup-btn.fail{background:#fff0f0!important;color:#a63c3c!important;border-color:#e7bcbc!important}
    .quick-backup-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:150;background:#202636;color:#fff;border-radius:999px;padding:10px 15px;font-size:13px;font-weight:800;box-shadow:0 12px 28px rgba(31,42,68,.22);opacity:0;pointer-events:none;transition:.18s;max-width:92vw;text-align:center}
    .quick-backup-toast.show{opacity:1}.quick-backup-toast.ok{background:#14785f}.quick-backup-toast.fail{background:#a63c3c}
    @media(max-width:620px){.quick-backup-btn{width:52px!important;height:52px!important;font-size:22px!important}.quick-backup-toast{top:12px;font-size:12px}}
  `;
  document.head.appendChild(style);
}
function toast(message,type=''){
  let box=document.getElementById('quickBackupToast');
  if(!box){box=document.createElement('div');box.id='quickBackupToast';box.className='quick-backup-toast';document.body.appendChild(box)}
  box.textContent=message;box.className=`quick-backup-toast show ${type}`.trim();
  clearTimeout(box._timer);box._timer=setTimeout(()=>box.className='quick-backup-toast',3200);
}
async function runBackup(button){
  if(button.classList.contains('busy'))return;
  button.classList.add('busy');button.classList.remove('ok','fail');button.textContent='⏳';
  toast('جاري إنشاء نسخة كاملة من بيانات النظام...');
  try{
    const fn=window.createManualBackup||((typeof createManualBackup==='function')?createManualBackup:null);
    if(!fn)throw new Error('خدمة النسخ الاحتياطي لم تجهز بعد. أعد فتح الصفحة وحاول مرة أخرى.');
    const result=await fn();
    if(result?.verified===false)throw new Error('لم تجتز النسخة فحص السلامة.');
    button.classList.add('ok');button.textContent='✅';
    const cloudOk=result?.cloudResult?.ok===true;
    const cloudSkipped=result?.cloudResult?.skipped===true;
    if(cloudOk)toast('تم حفظ النسخة محليًا ورفعها إلى Google Drive ✅','ok');
    else if(cloudSkipped)toast('تم حفظ النسخة محليًا ✅ — فعّل Google Drive لرفعها سحابيًا','ok');
    else toast('تم حفظ النسخة المحلية وفحصها ✅','ok');
  }catch(err){
    button.classList.add('fail');button.textContent='⚠️';
    toast(`تعذر إنشاء النسخة: ${err?.message||err}`,'fail');
  }finally{
    setTimeout(()=>{button.classList.remove('busy','ok','fail');button.textContent='💾'},1800);
  }
}
function install(){
  addStyles();
  const header=document.querySelector('header');if(!header)return false;
  const actions=header.querySelector('.header-actions')||header;
  if(document.getElementById('quickHomeBackupButton'))return true;
  const privacy=actions.querySelector('.privacy-btn');
  const button=document.createElement('button');
  button.id='quickHomeBackupButton';button.type='button';button.className='privacy-btn quick-backup-btn';button.textContent='💾';
  button.title='نسخة احتياطية كاملة الآن';button.setAttribute('aria-label','إنشاء نسخة احتياطية كاملة الآن');
  button.addEventListener('click',()=>runBackup(button));
  if(privacy)privacy.insertAdjacentElement('afterend',button);else actions.appendChild(button);
  return true;
}
function init(){if(install())return;let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>30)clearInterval(timer)},300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
