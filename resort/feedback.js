const commercialConfig=window.ADWAA_COMMERCIAL_CONFIG||null;
const portalSupabaseConfig=window.ADWAA_PORTAL_SUPABASE_CONFIG||null;
if(!commercialConfig?.namespace?.storage||!commercialConfig?.brand?.displayName||!portalSupabaseConfig?.url||!portalSupabaseConfig?.publishableKey||!portalSupabaseConfig?.projectRef){
  throw new Error('تم منع صفحة الملاحظات من الاتصال لأن إعداد النسخة التجارية غير مكتمل.');
}
const feedbackClient=window.supabase.createClient(portalSupabaseConfig.url,portalSupabaseConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
const FEEDBACK_BUCKET='customer-portal-feedback';
const FEEDBACK_VISITOR_STORAGE_KEY=`${commercialConfig.namespace.storage}:portal_visitor_key`;
const MAX_FILES=5,MAX_BYTES=5*1024*1024,MAX_EDGE=1600;
const feedbackForm=document.getElementById('feedbackForm');
const feedbackImages=document.getElementById('feedbackImages');
const feedbackPreview=document.getElementById('feedbackPreview');
const feedbackSubmit=document.getElementById('feedbackSubmit');
const feedbackCategory=document.getElementById('feedbackCategory');
const feedbackMessage=document.getElementById('feedbackMessage');
const feedbackName=document.getElementById('feedbackName');
const feedbackContact=document.getElementById('feedbackContact');
const feedbackBrandName=document.getElementById('feedbackBrandName');
let selectedFeedbackImages=[];

if(feedbackBrandName)feedbackBrandName.textContent=commercialConfig.brand.displayName;
document.title=`ملاحظات العملاء | ${commercialConfig.brand.displayName}`;

function visitorKey(){let key=localStorage.getItem(FEEDBACK_VISITOR_STORAGE_KEY);if(!key){key=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}-${Math.random()}`;localStorage.setItem(FEEDBACK_VISITOR_STORAGE_KEY,key)}return key}
function setStatus(message,type=''){const el=document.getElementById('feedbackStatus');el.textContent=message;el.className=`status ${type}`}
function validFile(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))return 'تقبل صور JPG وPNG وWebP فقط.';if(file.size>MAX_BYTES)return 'حجم الصورة يتجاوز 5MB.';return ''}
function resizeImage(file){return new Promise((resolve,reject)=>{const error=validFile(file);if(error)return reject(new Error(error));const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('ملف الصورة غير صالح.'));image.onload=()=>{const scale=Math.min(1,MAX_EDGE/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('تعذر تحسين الصورة.')),'image/webp',.84)};image.src=reader.result};reader.readAsDataURL(file)})}

async function prepareImages(){
  const files=[...feedbackImages.files].slice(0,MAX_FILES);selectedFeedbackImages=[];feedbackPreview.innerHTML='';
  for(const file of files){try{const blob=await resizeImage(file),url=URL.createObjectURL(blob);selectedFeedbackImages.push({file,blob,url});feedbackPreview.insertAdjacentHTML('beforeend',`<img src="${url}" alt="معاينة صورة مرفقة">`)}catch(error){setStatus(`${file.name}: ${error.message}`,'error')}}
  if(feedbackImages.files.length>MAX_FILES)setStatus('الحد الأقصى خمس صور. تم تجهيز أول خمس صور فقط.','error');
}

async function submitFeedback(event){
  event.preventDefault();feedbackSubmit.disabled=true;setStatus('جاري إرسال الملاحظة...');
  const begin=await feedbackClient.rpc('begin_customer_portal_feedback',{p_visitor_key:visitorKey(),p_category:feedbackCategory.value,p_message:feedbackMessage.value,p_customer_name:feedbackName.value,p_contact_number:feedbackContact.value});
  if(begin.error){feedbackSubmit.disabled=false;setStatus(begin.error.message.includes('rate limit')?'تم تجاوز عدد المحاولات المسموح. حاول بعد ساعة.':'تعذر إرسال الملاحظة. تحقق من البيانات وحاول لاحقًا.','error');return}
  const ticket=begin.data?.[0],paths=[];
  if(!ticket?.feedback_id||!ticket?.upload_token){feedbackSubmit.disabled=false;setStatus('تعذر بدء إرسال الملاحظة. حاول مرة أخرى.','error');return}
  for(let index=0;index<selectedFeedbackImages.length;index+=1){const item=selectedFeedbackImages[index],path=`${ticket.feedback_id}/${ticket.upload_token}/${crypto.randomUUID?.()||Date.now()}-${index}.webp`,upload=await feedbackClient.storage.from(FEEDBACK_BUCKET).upload(path,item.blob,{contentType:'image/webp',upsert:false});if(upload.error){if(paths.length)await feedbackClient.storage.from(FEEDBACK_BUCKET).remove(paths);feedbackSubmit.disabled=false;setStatus('تعذر رفع إحدى الصور. لم تُعتمد الملاحظة، حاول مرة أخرى.','error');return}paths.push(path)}
  const done=await feedbackClient.rpc('finalize_customer_portal_feedback',{p_feedback_id:ticket.feedback_id,p_upload_token:ticket.upload_token,p_image_paths:paths});
  feedbackSubmit.disabled=false;if(done.error){if(paths.length)await feedbackClient.storage.from(FEEDBACK_BUCKET).remove(paths);setStatus('تعذر اعتماد الملاحظة بعد رفع الصور. استخدم قناة التواصل المعتمدة للمنشأة.','error');return}
  selectedFeedbackImages.forEach(item=>URL.revokeObjectURL(item.url));selectedFeedbackImages=[];feedbackForm.reset();feedbackPreview.innerHTML='';setStatus(`شكرًا لك. تم إرسال ملاحظتك إلى إدارة ${commercialConfig.brand.displayName}.`,'success');
}

feedbackImages.addEventListener('change',prepareImages);
feedbackForm.addEventListener('submit',submitFeedback);
