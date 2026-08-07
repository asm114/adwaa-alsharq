(()=>{
'use strict';
if(window.__adwaaDriveStabilityInstalled)return;
window.__adwaaDriveStabilityInstalled=true;

const STATE_KEY='adwaaGoogleDriveState';
const BUILD='20260807.1';
let tokenClientPatchTimer=null;

function readState(){
  try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')}catch(_){return {}}
}
function previouslyLinked(){
  const s=readState();return Boolean(s.accountEmail||s.folderId)
}
function addStyle(){
  if(document.querySelector('link[data-drive-stability-ui]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=`drive-stability-ui.css?v=${BUILD}`;link.dataset.driveStabilityUi='1';document.head.appendChild(link);
}

function patchGoogleTokenClient(){
  const oauth=window.google?.accounts?.oauth2;
  if(!oauth?.initTokenClient||oauth.initTokenClient.__adwaaPatched)return false;
  const original=oauth.initTokenClient.bind(oauth);
  const patched=function(config){
    const originalCallback=config.callback;
    let wrappedClient=null;
    const nextConfig={...config,callback:(response)=>{
      try{
        originalCallback?.(response);
      }finally{
        if(response?.access_token&&wrappedClient){
          const expires=Math.max(60,Number(response.expires_in||3600));
          clearTimeout(tokenClientPatchTimer);
          tokenClientPatchTimer=setTimeout(()=>{
            try{wrappedClient.requestAccessToken({prompt:''})}catch(_){/* user can reconnect with one tap */}
          },Math.max(60,(expires-300))*1000);
        }
      }
    }};
    const client=original(nextConfig);
    const originalRequest=client.requestAccessToken.bind(client);
    client.requestAccessToken=(options={})=>{
      const opts={...options};
      if(previouslyLinked()&&opts.prompt==='consent')opts.prompt='';
      return originalRequest(opts);
    };
    wrappedClient=client;
    return client;
  };
  patched.__adwaaPatched=true;
  oauth.initTokenClient=patched;
  return true;
}

function ensurePatch(){
  if(patchGoogleTokenClient())return;
  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(patchGoogleTokenClient()||attempts>40)clearInterval(timer)},250);
}

function statusText(){
  const s=readState();
  if(s.lastUploadOk===true)return 'محمي على الجهاز وGoogle Drive';
  if(s.accountEmail)return 'Google Drive مربوط — يحتاج جلسة نشطة عند الرفع';
  return 'النسخ المحلية تعمل — اربط Google Drive مرة واحدة';
}
function statusClass(){const s=readState();return s.lastUploadOk===true?'ok':s.accountEmail?'ready':'warn'}

function simplifyDriveCard(){
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
    summary.querySelector('#driveSimpleBackup').addEventListener('click',()=>window.createManualBackup?.());
    summary.querySelector('#driveSimpleConnect').addEventListener('click',()=>window.connectGoogleDrive?.());
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
  return true;
}

function renameProtectionCopy(){
  const card=document.getElementById('googleDriveCard');if(!card)return;
  const meta=card.querySelector('.release-info-head .meta');
  if(meta)meta.textContent='نسخة سحابية لحماية شغلك. النسخة المحلية تبقى موجودة دائمًا.';
}

function watchState(){
  const original=Storage.prototype.setItem;
  if(original.__adwaaDriveWatch)return;
  const wrapped=function(key,value){const r=original.call(this,key,value);if(key===STATE_KEY)setTimeout(simplifyDriveCard,0);return r};
  wrapped.__adwaaDriveWatch=true;Storage.prototype.setItem=wrapped;
}

function init(){
  addStyle();ensurePatch();watchState();
  const run=()=>{simplifyDriveCard();renameProtectionCopy()};
  run();setTimeout(run,700);setTimeout(run,1800);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
