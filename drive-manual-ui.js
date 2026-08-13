(()=>{
'use strict';
if(window.__adwaaDriveManualUiInstalled)return;
window.__adwaaDriveManualUiInstalled=true;

const STATE_KEY='adwaaGoogleDriveState';
const BUILD='20260813.1';

function readState(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')}catch(_){return {}}}
function addStyle(){
  if(document.querySelector('link[data-drive-stability-ui]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=`drive-stability-ui.css?v=${BUILD}`;link.dataset.driveStabilityUi='1';document.head.appendChild(link);
}
function statusText(){
  const s=readState();
  if(s.lastUploadOk===true)return 'محمي على الجهاز وGoogle Drive';
  if(s.accountEmail)return 'Google Drive مربوط — يتم الاتصال عند طلب النسخة فقط';
  return 'النسخ المحلية تعمل — ويمكن ربط Google Drive عند الحاجة';
}
function statusClass(){const s=readState();return s.lastUploadOk===true?'ok':s.accountEmail?'ready':'warn'}
function updateCard(){
  const card=document.getElementById('googleDriveCard');if(!card)return false;
  card.classList.add('drive-simple-mode');
  let summary=document.getElementById('driveSimpleSummary');
  if(!summary){
    summary=document.createElement('div');summary.id='driveSimpleSummary';summary.className='drive-simple-summary';
    summary.innerHTML=`
      <div class="drive-simple-main">
        <div><span class="drive-simple-label">حماية شغلك</span><b id="driveSimpleStatus">—</b><small id="driveSimpleNote">—</small></div>
        <span id="driveSimpleDot" class="drive-simple-dot"></span>
      </div>
      <div class="drive-simple-actions">
        <button id="driveSimpleBackup" class="primary" type="button">💾 نسخة كاملة الآن</button>
        <button id="driveSimpleConnect" class="secondary" type="button">☁️ تفعيل Google Drive</button>
        <button id="driveSimpleDetails" class="secondary" type="button">التفاصيل</button>
      </div>`;
    card.prepend(summary);
    summary.querySelector('#driveSimpleBackup').addEventListener('click',async()=>{
      try{await window.createManualBackup?.()}finally{updateCard()}
    });
    summary.querySelector('#driveSimpleConnect').addEventListener('click',async()=>{
      try{await window.connectGoogleDrive?.()}finally{updateCard()}
    });
    summary.querySelector('#driveSimpleDetails').addEventListener('click',()=>card.classList.toggle('drive-details-open'));
  }
  const state=readState(),status=document.getElementById('driveSimpleStatus'),note=document.getElementById('driveSimpleNote'),dot=document.getElementById('driveSimpleDot'),connect=document.getElementById('driveSimpleConnect');
  if(status)status.textContent=statusText();
  if(note){
    const count=state.backupCount==null?'—':state.backupCount;
    const last=state.lastUploadAt?new Date(state.lastUploadAt).toLocaleString('ar-SA'):'لا يوجد رفع حديث';
    note.textContent=`آخر رفع: ${last} • النسخ السحابية: ${count}`;
  }
  if(dot)dot.className=`drive-simple-dot ${statusClass()}`;
  if(connect)connect.textContent=state.accountEmail?'☁️ إعادة تفعيل Drive':'☁️ ربط Google Drive';
  const meta=card.querySelector('.release-info-head .meta');
  if(meta)meta.textContent='النسخة المحلية تعمل دائمًا. Google Drive يتصل فقط عند النسخ أو الربط اليدوي.';
  return true;
}
function init(){
  addStyle();
  updateCard();
  setTimeout(updateCard,600);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
