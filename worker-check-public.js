(()=>{
'use strict';
const PORTAL_PROJECT_REF='ztqqdjryvecscidxxbfe';
const SUPABASE_URL=`https://${PORTAL_PROJECT_REF}.supabase.co`;
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const BUCKET='customer-portal-worker-checks';
const MAX_PHOTOS=6;
const MAX_RECORD_SECONDS=60;
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const token=new URLSearchParams(location.search).get('token')||'';
let check=null;
let photos=[];
let selectedIssues=new Set();
let recorder=null;
let recordingStream=null;
let recordingChunks=[];
let recordingStartedAt=0;
let recordingTimer=null;
let voiceBlob=null;
let voiceUrl='';

const $=id=>document.getElementById(id);
function show(id){['loading','invalid','done','formArea'].forEach(key=>$(key)?.classList.add('hidden'));$(id)?.classList.remove('hidden')}
function setSync(text,type=''){const el=$('sync');if(!el)return;el.textContent=text;el.className=`sync ${type}`.trim()}
function setSubmitStatus(text,type=''){const el=$('submitStatus');if(!el)return;el.textContent=text;el.className=`status-box ${type}`.trim();el.classList.remove('hidden')}
function propertyLabel(){const type=String(check?.property_type||'').trim(),name=String(check?.property_name||'').trim();if(!type)return name||'المنشأة';if(!name)return type;return name.startsWith(type)?name:`${type} ${name}`}
function formatDate(value){if(!value)return '—';const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'medium'}).format(d)}
function randomName(prefix,ext){const random=crypto.randomUUID().replaceAll('-','');return `${check.check_id}/${token}/${prefix}-${Date.now()}-${random}.${ext}`}
function imageExtension(type){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}
function audioExtension(type){if(type.includes('mp4'))return'm4a';if(type.includes('ogg'))return'ogg';if(type.includes('mpeg'))return'mp3';if(type.includes('aac'))return'aac';return'webm'}

async function loadCheck(){
  if(token.length<20){$('invalidText').textContent='الرابط ناقص أو غير صالح. اطلب رابطًا جديدًا من الإدارة.';show('invalid');setSync('رابط غير صالح','bad');return}
  try{
    const {data,error}=await client.rpc('get_customer_portal_worker_check',{p_access_token:token});
    if(error)throw error;
    check=Array.isArray(data)?data[0]:data;
    if(!check)throw new Error('الرابط غير موجود أو انتهت صلاحيته');
    $('propertyLabel').textContent=propertyLabel();
    document.title=`تشييك العامل | ${propertyLabel()}`;
    $('bookingCode').textContent=check.booking_code||'—';
    $('bookingDate').textContent=formatDate(check.booking_date);
    setSync('الرابط آمن وجاهز','ok');
    if(['submitted','reviewed'].includes(check.status)){show('done');return}
    show('formArea');
  }catch(error){console.error(error);$('invalidText').textContent='تعذر فتح التشييك. اطلب رابطًا جديدًا من الإدارة.';show('invalid');setSync('تعذر الفتح','bad')}
}

function renderIssues(){
  document.querySelectorAll('[data-issue]').forEach(button=>button.classList.toggle('selected',selectedIssues.has(button.dataset.issue)));
}
function toggleIssue(value){
  if(value==='ok'){
    selectedIssues=new Set(selectedIssues.has('ok')?[]:['ok']);
  }else{
    selectedIssues.delete('ok');
    if(selectedIssues.has(value))selectedIssues.delete(value);else selectedIssues.add(value);
  }
  renderIssues();
}

function compressImage(file,maxEdge=1280,quality=.72){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      try{
        const scale=Math.min(1,maxEdge/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(blob):reject(new Error('تعذر تجهيز الصورة'));},'image/jpeg',quality);
      }catch(error){URL.revokeObjectURL(url);reject(error)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('تعذر فتح الصورة'))};
    img.src=url;
  });
}
async function addPhoto(file){
  if(!file||photos.length>=MAX_PHOTOS)return;
  try{
    const blob=await compressImage(file),previewUrl=URL.createObjectURL(blob);
    photos.push({id:crypto.randomUUID(),blob,previewUrl});renderPhotos();
  }catch(error){console.error(error);setSubmitStatus('تعذر تجهيز الصورة. جرّب صورة أخرى.','error')}
}
function removePhoto(id){
  const item=photos.find(photo=>photo.id===id);if(item)URL.revokeObjectURL(item.previewUrl);
  photos=photos.filter(photo=>photo.id!==id);renderPhotos();
}
function renderPhotos(){
  const root=$('photoGrid');if(!root)return;
  root.innerHTML=photos.map(photo=>`<div class="photo"><img src="${photo.previewUrl}" alt="صورة التشييك"><button type="button" data-remove-photo="${photo.id}" aria-label="حذف الصورة">×</button></div>`).join('');
  root.querySelectorAll('[data-remove-photo]').forEach(button=>button.addEventListener('click',()=>removePhoto(button.dataset.removePhoto)));
  $('photoCounter').textContent=`${photos.length} من ${MAX_PHOTOS} صور`;
  $('photoInput').disabled=photos.length>=MAX_PHOTOS;
}

function supportedAudioMime(){
  if(!window.MediaRecorder)return'';
  const choices=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'];
  return choices.find(type=>MediaRecorder.isTypeSupported?.(type))||'';
}
function stopTracks(){recordingStream?.getTracks?.().forEach(track=>track.stop());recordingStream=null}
function clearRecordingTimer(){if(recordingTimer){clearInterval(recordingTimer);recordingTimer=null}}
function updateRecordingState(){
  const seconds=Math.min(MAX_RECORD_SECONDS,Math.max(0,Math.round((Date.now()-recordingStartedAt)/1000)));
  $('voiceState').textContent=`جاري التسجيل… ${seconds} من ${MAX_RECORD_SECONDS} ثانية`;
  if(seconds>=MAX_RECORD_SECONDS)stopRecording();
}
async function startRecording(){
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('voiceState').textContent='التسجيل الصوتي غير مدعوم على هذا الجهاز. يمكنك إرسال الصور فقط.';return}
  try{
    recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});recordingChunks=[];
    const mime=supportedAudioMime();recorder=new MediaRecorder(recordingStream,mime?{mimeType:mime}:undefined);
    recorder.ondataavailable=event=>{if(event.data?.size)recordingChunks.push(event.data)};
    recorder.onstop=()=>{
      clearRecordingTimer();const type=recorder?.mimeType||recordingChunks[0]?.type||'audio/webm';voiceBlob=new Blob(recordingChunks,{type});
      if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=URL.createObjectURL(voiceBlob);$('voicePreview').src=voiceUrl;$('voicePreview').classList.remove('hidden');
      $('voiceState').textContent='✅ التسجيل الصوتي جاهز للإرسال';$('voiceButton').textContent='🎙️ تسجيل الصوت من جديد';$('voiceButton').classList.remove('recording');stopTracks();recorder=null;
    };
    recorder.start(500);recordingStartedAt=Date.now();updateRecordingState();recordingTimer=setInterval(updateRecordingState,500);
    $('voiceButton').textContent='⏹️ إيقاف التسجيل';$('voiceButton').classList.add('recording');
  }catch(error){console.error(error);stopTracks();$('voiceState').textContent='تعذر تشغيل الميكروفون. اسمح للمتصفح باستخدامه أو أرسل الصور فقط.'}
}
function stopRecording(){if(recorder&&recorder.state!=='inactive')recorder.stop()}
async function toggleRecording(){if(recorder&&recorder.state==='recording'){stopRecording();return}await startRecording()}

async function uploadBlob(blob,prefix){
  const type=blob.type||'application/octet-stream';const ext=prefix==='voice'?audioExtension(type):imageExtension(type);const path=randomName(prefix,ext);
  const {error}=await client.storage.from(BUCKET).upload(path,blob,{contentType:type,upsert:false,cacheControl:'3600'});if(error)throw error;return path;
}
async function submitCheck(){
  if(!check||check.status!=='ready')return;
  if(!selectedIssues.size){setSubmitStatus('اختر حالة واحدة على الأقل: ملاحظة أو «كل شيء طبيعي».','error');return}
  if(!photos.length){setSubmitStatus('أضف صورة واحدة على الأقل قبل الإرسال.','error');return}
  if(recorder?.state==='recording'){setSubmitStatus('أوقف التسجيل الصوتي أولًا ثم أرسل.','error');return}
  const button=$('submitButton');button.disabled=true;button.textContent='جاري الإرسال…';
  try{
    setSubmitStatus('جاري رفع الصور…');const photoPaths=[];
    for(let i=0;i<photos.length;i+=1){setSubmitStatus(`جاري رفع الصورة ${i+1} من ${photos.length}…`);photoPaths.push(await uploadBlob(photos[i].blob,'photo'))}
    let voicePath='';if(voiceBlob){setSubmitStatus('جاري رفع التسجيل الصوتي…');voicePath=await uploadBlob(voiceBlob,'voice')}
    setSubmitStatus('جاري تثبيت التشييك وربطه بالحجز…');
    const {data,error}=await client.rpc('finalize_customer_portal_worker_check',{
      p_access_token:token,p_issue_types:[...selectedIssues],p_photo_paths:photoPaths,p_voice_path:voicePath
    });
    if(error)throw error;if(data!==true)throw new Error('لم يكتمل حفظ التشييك');
    setSync('تم الإرسال','ok');show('done');
  }catch(error){console.error(error);setSubmitStatus('تعذر إكمال الإرسال. تأكد من الإنترنت وحاول مرة أخرى.','error');button.disabled=false;button.textContent='إرسال التشييك للإدارة'}
}

function bind(){
  document.querySelectorAll('[data-issue]').forEach(button=>button.addEventListener('click',()=>toggleIssue(button.dataset.issue)));
  $('photoInput')?.addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(file)await addPhoto(file)});
  $('voiceButton')?.addEventListener('click',toggleRecording);
  $('submitButton')?.addEventListener('click',submitCheck);
  window.addEventListener('pagehide',()=>{clearRecordingTimer();stopTracks();photos.forEach(item=>URL.revokeObjectURL(item.previewUrl));if(voiceUrl)URL.revokeObjectURL(voiceUrl)},{once:true});
}
bind();loadCheck();
})();
