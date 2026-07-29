/* إدارة بوابة العملاء — معزولة عن منطق الحجوزات الرئيسي. */
const CUSTOMER_PORTAL_BUCKET='customer-portal-images';
const CUSTOMER_PORTAL_MAX_ORIGINAL_BYTES=10*1024*1024;
const CUSTOMER_PORTAL_MAX_EDGE=2200;
const CUSTOMER_PORTAL_TYPES=new Set(['image/jpeg','image/png','image/webp']);
let customerPortalImages=[];
let customerPortalPending=[];
let customerPortalLoaded=false;

function portalAdminStatus(message,type=''){
  const el=document.getElementById('portalAdminStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`notice ${type?`portal-status-${type}`:''}`;
}

function portalMoney(value){
  return value===null||value===''||!Number.isFinite(Number(value))?'غير محدد':`${Number(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
}

function updatePortalPricePreview(){
  const base=document.getElementById('portalDailyPrice')?.value;
  const fee=document.getElementById('portalOvernightFee')?.value;
  const enabled=document.getElementById('portalOvernightEnabled')?.checked;
  const baseNumber=base===''?null:Number(base);
  const feeNumber=enabled&&fee!==''?Number(fee):0;
  document.getElementById('portalPreviewBase').textContent=portalMoney(baseNumber);
  document.getElementById('portalPreviewFee').textContent=enabled?portalMoney(feeNumber):'المبيت معطل';
  document.getElementById('portalPreviewTotal').textContent=baseNumber===null?'غير محدد':portalMoney(baseNumber+feeNumber);
}

async function loadCustomerPortalAdmin(){
  if(!window.supabaseClient){
    portalAdminStatus('تعذر تهيئة الاتصال بقاعدة البيانات.','error');
    return;
  }
  portalAdminStatus('جاري تحميل بيانات بوابة العملاء...');
  const [{data:settings,error:settingsError},{data:images,error:imagesError}]=await Promise.all([
    supabaseClient.from('customer_portal_settings').select('*').eq('id','main').maybeSingle(),
    supabaseClient.from('customer_portal_images').select('*').order('sort_order').order('created_at')
  ]);
  if(settingsError||imagesError){
    portalAdminStatus('تعذر تحميل بيانات البوابة. تأكد من تطبيق Migration على بيئة Staging بعد اعتماده.','error');
    console.error(settingsError||imagesError);
    return;
  }
  if(settings){
    portalWhatsapp.value=settings.whatsapp_number||'';
    portalInstagram.value=settings.instagram_url||'';
    portalMaps.value=settings.maps_url||'';
    portalRequestsOpen.value=String(settings.booking_requests_open);
    portalPauseMessage.value=settings.pause_message||'';
    portalDailyPrice.value=settings.daily_price??'';
    portalOvernightFee.value=settings.overnight_fee??100;
    portalOvernightEnabled.checked=settings.overnight_enabled!==false;
  }
  customerPortalImages=images||[];
  renderCustomerPortalImages();
  updatePortalPricePreview();
  customerPortalLoaded=true;
  portalAdminStatus('تم تحميل البيانات المركزية.','success');
}

async function saveCustomerPortalSettings(event){
  event.preventDefault();
  const whatsapp=portalWhatsapp.value.replace(/\D/g,'');
  if(!/^9665\d{8}$/.test(whatsapp)){
    portalAdminStatus('رقم واتساب يجب أن يكون بصيغة 9665 متبوعًا بثمانية أرقام.','error');
    return;
  }
  const daily=portalDailyPrice.value===''?null:Number(portalDailyPrice.value);
  const fee=Number(portalOvernightFee.value);
  if((daily!==null&&daily<0)||!Number.isFinite(fee)||fee<0){
    portalAdminStatus('تحقق من قيم الأسعار ورسوم المبيت.','error');
    return;
  }
  const payload={
    id:'main',
    whatsapp_number:whatsapp,
    instagram_url:portalInstagram.value.trim(),
    maps_url:portalMaps.value.trim(),
    booking_requests_open:portalRequestsOpen.value==='true',
    pause_message:portalPauseMessage.value.trim(),
    daily_price:daily,
    overnight_fee:fee,
    overnight_enabled:portalOvernightEnabled.checked,
    updated_by:currentUser?.id||null
  };
  portalSettingsForm.classList.add('portal-busy');
  const {error}=await supabaseClient.from('customer_portal_settings').upsert(payload);
  portalSettingsForm.classList.remove('portal-busy');
  if(error){
    console.error(error);
    portalAdminStatus('تعذر حفظ الإعدادات. لم تُغيّر البيانات الحالية.','error');
    return;
  }
  updatePortalPricePreview();
  portalAdminStatus('تم حفظ بيانات بوابة العملاء.','success');
}

function customerPortalExtension(type){
  return type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
}

function loadPortalBitmap(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('تعذر قراءة الصورة.'))};
    image.src=url;
  });
}

async function reencodeCustomerPortalImage(file){
  const name=file.name.toLowerCase();
  if(name.endsWith('.heic')||name.endsWith('.heif')||file.type==='image/heic'||file.type==='image/heif'){
    throw new Error('صور HEIC غير مدعومة حاليًا. حوّل الصورة إلى JPG أو PNG أو WebP ثم أعد المحاولة.');
  }
  if(file.size>CUSTOMER_PORTAL_MAX_ORIGINAL_BYTES)throw new Error('حجم الصورة الأصلية يتجاوز 10MB.');
  if(!CUSTOMER_PORTAL_TYPES.has(file.type))throw new Error('نوع الملف غير مسموح. استخدم JPG أو PNG أو WebP فقط.');
  const image=await loadPortalBitmap(file);
  const scale=Math.min(1,CUSTOMER_PORTAL_MAX_EDGE/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d',{alpha:file.type==='image/png'}).drawImage(image,0,0,canvas.width,canvas.height);
  const outputType=file.type==='image/png'?'image/png':'image/webp';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,outputType,.84));
  if(!blob)throw new Error('تعذر إعادة ترميز الصورة بأمان.');
  return {blob,type:outputType,extension:customerPortalExtension(outputType),width:canvas.width,height:canvas.height};
}

async function previewCustomerPortalFiles(files){
  clearCustomerPortalPreview();
  const errors=[];
  for(const file of files){
    try{
      const encoded=await reencodeCustomerPortalImage(file);
      customerPortalPending.push({file,...encoded,url:URL.createObjectURL(encoded.blob)});
    }catch(error){errors.push(`${file.name}: ${error.message}`)}
  }
  portalImagePreview.innerHTML=customerPortalPending.map(item=>`<article class="portal-preview-card"><img src="${item.url}" alt=""><p>${escapeHtml(item.file.name)}<br>${item.width}×${item.height} — ${(item.blob.size/1024).toFixed(0)}KB بعد التحسين</p></article>`).join('');
  portalUploadButton.disabled=!customerPortalPending.length;
  portalClearPreviewButton.disabled=!customerPortalPending.length;
  if(errors.length)portalAdminStatus(errors.join(' | '),'error');
  else if(customerPortalPending.length)portalAdminStatus('تمت معاينة الصور وإعادة ترميزها. لم يبدأ الرفع بعد.','success');
}

function clearCustomerPortalPreview(){
  customerPortalPending.forEach(item=>URL.revokeObjectURL(item.url));
  customerPortalPending=[];
  if(window.portalImagePreview)portalImagePreview.innerHTML='';
  if(window.portalImageInput)portalImageInput.value='';
  if(window.portalUploadButton)portalUploadButton.disabled=true;
  if(window.portalClearPreviewButton)portalClearPreviewButton.disabled=true;
}

async function uploadCustomerPortalImages(){
  if(!customerPortalPending.length||!currentUser?.id)return;
  portalUploadButton.disabled=true;
  const queue=[...customerPortalPending];
  const failures=[];
  let heroAssigned=customerPortalImages.some(image=>image.is_hero);
  let nextOrder=customerPortalImages.reduce((max,image)=>Math.max(max,Number(image.sort_order)||0),-1)+1;
  for(const item of queue){
    const objectId=crypto.randomUUID();
    const path=`${currentUser.id}/${objectId}.${item.extension}`;
    const {error:uploadError}=await supabaseClient.storage.from(CUSTOMER_PORTAL_BUCKET).upload(path,item.blob,{contentType:item.type,upsert:false});
    if(uploadError){failures.push(`${item.file.name}: فشل رفع الملف`);continue}
    const {error:insertError}=await supabaseClient.from('customer_portal_images').insert({
      storage_path:path,
      alt_text:null,
      sort_order:nextOrder,
      is_hero:!heroAssigned,
      is_visible:true,
      mime_type:item.type,
      size_bytes:item.blob.size,
      created_by:currentUser.id,
      updated_by:currentUser.id
    });
    if(insertError){
      await supabaseClient.storage.from(CUSTOMER_PORTAL_BUCKET).remove([path]);
      failures.push(`${item.file.name}: لم تُحفظ بيانات الصورة وأزيل الملف المرفوع`);
    }else{
      heroAssigned=true;
      nextOrder+=1;
    }
  }
  clearCustomerPortalPreview();
  await loadCustomerPortalAdmin();
  portalAdminStatus(failures.length?failures.join(' | '):'تم رفع الصور وحفظ بياناتها. ',failures.length?'error':'success');
}

function portalPublicImageUrl(path){
  return supabaseClient.storage.from(CUSTOMER_PORTAL_BUCKET).getPublicUrl(path).data.publicUrl;
}

function renderCustomerPortalImages(){
  const root=document.getElementById('portalImagesList');
  if(!root)return;
  if(!customerPortalImages.length){
    root.innerHTML='<div class="portal-empty">لا توجد صور مرفوعة بعد.</div>';
    return;
  }
  root.innerHTML=customerPortalImages.map((image,index)=>`<article class="portal-image-card" data-image-id="${image.id}">
    <img src="${portalPublicImageUrl(image.storage_path)}" alt="${escapeHtml(image.alt_text||'صورة من منتجع أضواء الشرق')}" loading="lazy">
    <div class="portal-image-badges">${image.is_hero?'<span class="badge confirmed">رئيسية</span>':''}<span class="badge ${image.is_visible?'confirmed':'cancelled'}">${image.is_visible?'ظاهرة':'مخفية'}</span></div>
    <label>وصف اختياري<input maxlength="240" value="${escapeHtml(image.alt_text||'')}" onchange="updateCustomerPortalImage('${image.id}',{alt_text:this.value.trim()||null})"></label>
    <div class="actions">
      <button class="secondary" type="button" onclick="moveCustomerPortalImage('${image.id}',-1)" ${index===0?'disabled':''}>أعلى</button>
      <button class="secondary" type="button" onclick="moveCustomerPortalImage('${image.id}',1)" ${index===customerPortalImages.length-1?'disabled':''}>أسفل</button>
      <button class="secondary" type="button" onclick="setCustomerPortalHero('${image.id}')">رئيسية</button>
      <button class="secondary" type="button" onclick="updateCustomerPortalImage('${image.id}',{is_visible:${!image.is_visible}})">${image.is_visible?'إخفاء':'إظهار'}</button>
      <button class="danger" type="button" onclick="deleteCustomerPortalImage('${image.id}')">حذف</button>
    </div>
  </article>`).join('');
}

async function updateCustomerPortalImage(id,changes){
  const {error}=await supabaseClient.from('customer_portal_images').update({...changes,updated_by:currentUser?.id||null}).eq('id',id);
  if(error){portalAdminStatus('تعذر تحديث الصورة.','error');return}
  await loadCustomerPortalAdmin();
}

async function setCustomerPortalHero(id){
  const previous=customerPortalImages.find(image=>image.is_hero&&image.id!==id);
  if(previous){
    const {error}=await supabaseClient.from('customer_portal_images').update({is_hero:false,updated_by:currentUser?.id||null}).eq('id',previous.id);
    if(error){portalAdminStatus('تعذر تغيير الصورة الرئيسية.','error');return}
  }
  await updateCustomerPortalImage(id,{is_hero:true,is_visible:true});
}

async function moveCustomerPortalImage(id,direction){
  const index=customerPortalImages.findIndex(image=>image.id===id);
  const otherIndex=index+direction;
  if(index<0||otherIndex<0||otherIndex>=customerPortalImages.length)return;
  const first=customerPortalImages[index],second=customerPortalImages[otherIndex];
  const [{error:firstError},{error:secondError}]=await Promise.all([
    supabaseClient.from('customer_portal_images').update({sort_order:second.sort_order,updated_by:currentUser?.id||null}).eq('id',first.id),
    supabaseClient.from('customer_portal_images').update({sort_order:first.sort_order,updated_by:currentUser?.id||null}).eq('id',second.id)
  ]);
  if(firstError||secondError){portalAdminStatus('تعذر حفظ ترتيب الصور. أعد تحميل البيانات وحاول مجددًا.','error');return}
  await loadCustomerPortalAdmin();
}

async function deleteCustomerPortalImage(id){
  const image=customerPortalImages.find(item=>item.id===id);
  if(!image||!confirm('حذف هذه الصورة من البوابة؟'))return;
  const {data:deleted,error:deleteError}=await supabaseClient.from('customer_portal_images').delete().eq('id',id).select('id,storage_path').maybeSingle();
  if(deleteError||!deleted||deleted.storage_path!==image.storage_path){
    portalAdminStatus('لم يتم التحقق من حذف سجل الصورة؛ لم يُحذف ملف Storage.','error');
    return;
  }
  const {error:storageError}=await supabaseClient.storage.from(CUSTOMER_PORTAL_BUCKET).remove([image.storage_path]);
  if(storageError){
    portalAdminStatus('حُذف سجل الصورة، لكن تعذر حذف ملف Storage. يلزم تنظيفه يدويًا بعد التحقق.','error');
    return;
  }
  await loadCustomerPortalAdmin();
  portalAdminStatus('تم حذف الصورة بعد التحقق من حذف سجلها.','success');
}

document.addEventListener('DOMContentLoaded',()=>{
  portalDailyPrice?.addEventListener('input',updatePortalPricePreview);
  portalOvernightFee?.addEventListener('input',updatePortalPricePreview);
  portalOvernightEnabled?.addEventListener('change',updatePortalPricePreview);
  portalImageInput?.addEventListener('change',event=>previewCustomerPortalFiles([...event.target.files]));
  portalUploadButton?.addEventListener('click',uploadCustomerPortalImages);
  portalClearPreviewButton?.addEventListener('click',clearCustomerPortalPreview);
});
