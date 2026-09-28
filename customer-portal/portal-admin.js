/* Customer Portal admin phase 1 sections. */
const PORTAL_RESORT_INFO_TABLE='customer_portal_resort_info';
const PORTAL_IMAGES_TABLE='customer_portal_images';
const PORTAL_UNAVAILABLE_TABLE='customer_portal_unavailable_periods';
const PORTAL_PRICING_TABLE='customer_portal_pricing';
const PORTAL_SEASONS_TABLE='customer_portal_seasons';
const PORTAL_CONTACT_TABLE='customer_portal_contact';
const PORTAL_IMAGES_BUCKET='customer-portal-images';
const PORTAL_IMAGE_MAX_BYTES=10*1024*1024;
const PORTAL_IMAGE_MAX_EDGE=1800;
const PORTAL_IMAGE_CATEGORIES=[
  'general',
  'green_area',
  'pool',
  'tent',
  "men's_majlis",
  'indoor_hall',
  'kitchen',
  'double_bedroom',
  'six_beds_room',
  'extra_room',
  'outdoor_session'
];
const PORTAL_IMAGE_CATEGORY_LABELS={
  general:'عام',
  green_area:'المسطحات الخضراء',
  pool:'المسبح',
  tent:'الخيمة',
  "men's_majlis":'مجلس الرجال',
  indoor_hall:'الصالة الداخلية',
  kitchen:'المطبخ',
  double_bedroom:'غرفة السرير المزدوج',
  six_beds_room:'غرفة الستة أسرّة',
  extra_room:'الغرفة الإضافية',
  outdoor_session:'الجلسات الخارجية'
};
let portalResortFeatures=[];
let portalImages=[];
let portalUnavailablePeriods=[];
let portalSeasons=[];
let portalSelectedImages=[];
let portalDraggedImageId='';

const PORTAL_RESORT_DEFAULTS={
  id:'main',
  resort_name:'أضواء الشرق',
  short_description:'منتجع واسع في القاع البارد لجلساتكم ومناسباتكم الخاصة',
  detailed_description:'منتجع أضواء الشرق في القاع البارد منتجع واسع بمساحة تقارب 5000 متر مربع، يتميز بمسطحات خضراء كبيرة وجلسات خارجية متعددة، ويجمع بين الخصوصية وسعة المكان وراحة الضيوف.',
  checkin_time:'3:30 عصرًا',
  checkout_time:'3:00 فجرًا',
  maps_url:'https://maps.app.goo.gl/uh8t93tMm5agNWvx7?g_st=com.google.maps.preview.copy',
  whatsapp_url:'https://iwtsp.com/966560442799',
  instagram_url:'https://www.instagram.com/adwaa_al_sharq_resort?igsh=ODg0Z3AxZnNld2Jx&utm_source=q',
  resort_address:'القاع البارد',
  checkin_instructions:'',
  features:[
    'مسطحات خضراء واسعة',
    'جلسات خارجية متعددة',
    'خيمة مؤثثة',
    'صالة داخلية',
    'مطبخ داخلي ومطبخ خارجي',
    'مسبح كبير مغلق بدرابزين زجاجي'
  ],
  booking_requests_open:true,
  closed_message:'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا عبر واتساب للاستفسار.'
};

function portalInfoStatus(message,type=''){
  const el=document.getElementById('portalResortInfoStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`portal-inline-status ${type}`;
}

function portalSetValue(id,value){
  const el=document.getElementById(id);
  if(el)el.value=value??'';
}

function portalReadValue(id){
  return String(document.getElementById(id)?.value||'').trim();
}

function portalImageStatus(message,type=''){
  const el=document.getElementById('portalImagesStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`portal-inline-status ${type}`;
}

function portalUnavailableStatus(message,type=''){
  const el=document.getElementById('portalUnavailableStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`portal-inline-status ${type}`;
}

function portalPricingStatus(message,type=''){
  const el=document.getElementById('portalPricingStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`portal-inline-status ${type}`;
}

function portalSeasonsStatus(message,type=''){
  const el=document.getElementById('portalSeasonsStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`portal-inline-status ${type}`;
}

function portalContactStatus(message,type=''){
  const el=document.getElementById('portalContactStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`portal-inline-status ${type}`;
}

function portalFormatGregorian(dateValue){
  if(!dateValue)return '—';
  const date=new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'full'}).format(date);
}

function portalFormatHijri(dateValue){
  if(!dateValue)return '—';
  const date=new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{dateStyle:'full'}).format(date);
}

function portalDateDays(dateValue){
  return Math.floor(new Date(`${dateValue}T00:00:00Z`).getTime()/86400000);
}

function portalRangesOverlap(aStart,aEnd,bStart,bEnd){
  return portalDateDays(aStart)<=portalDateDays(bEnd)&&portalDateDays(bStart)<=portalDateDays(aEnd);
}

function renderPortalImageCategoryOptions(){
  const selects=[
    document.getElementById('portalImageCategory'),
    ...document.querySelectorAll('[data-portal-image-category]')
  ].filter(Boolean);
  const html=PORTAL_IMAGE_CATEGORIES
    .map(category=>`<option value="${escapeHtml(category)}">${escapeHtml(PORTAL_IMAGE_CATEGORY_LABELS[category]||category)}</option>`)
    .join('');
  selects.forEach(select=>{
    const current=select.value;
    select.innerHTML=html;
    if(current)select.value=current;
  });
}

function renderPortalFeatureList(){
  const root=document.getElementById('portalFeatureList');
  if(!root)return;
  if(!portalResortFeatures.length){
    root.innerHTML='<div class="portal-empty-inline">لا توجد مميزات مضافة بعد.</div>';
    return;
  }
  root.innerHTML=portalResortFeatures.map((feature,index)=>`
    <div class="portal-feature-item">
      <span>${escapeHtml(feature)}</span>
      <button class="danger" type="button" onclick="removePortalFeature(${index})">حذف</button>
    </div>
  `).join('');
}

function addPortalFeature(){
  const input=document.getElementById('portalFeatureInput');
  const value=String(input?.value||'').trim();
  if(!value)return;
  if(!portalResortFeatures.includes(value))portalResortFeatures.push(value);
  input.value='';
  renderPortalFeatureList();
}

function removePortalFeature(index){
  portalResortFeatures.splice(index,1);
  renderPortalFeatureList();
}

function fillPortalResortInfo(data){
  const value={...PORTAL_RESORT_DEFAULTS,...(data||{})};
  portalSetValue('portalResortName',value.resort_name);
  portalSetValue('portalShortDescription',value.short_description);
  portalSetValue('portalDetailedDescription',value.detailed_description);
  portalSetValue('portalCheckinTime',value.checkin_time);
  portalSetValue('portalCheckoutTime',value.checkout_time);
  portalSetValue('portalMapsUrl',value.maps_url);
  portalSetValue('portalWhatsappUrl',value.whatsapp_url);
  portalSetValue('portalInstagramUrl',value.instagram_url);
  portalSetValue('portalAddress',value.resort_address);
  portalSetValue('portalCheckinInstructions',value.checkin_instructions);
  portalSetValue('portalRequestsOpen',String(value.booking_requests_open!==false));
  portalSetValue('portalClosedMessage',value.closed_message);
  portalResortFeatures=Array.isArray(value.features)?value.features.filter(Boolean):[];
  renderPortalFeatureList();
}

async function loadPortalResortInfo(){
  if(!window.supabaseClient){
    portalInfoStatus('تعذر تهيئة الاتصال بقاعدة البيانات.','error');
    fillPortalResortInfo();
    return;
  }
  portalInfoStatus('جاري تحميل معلومات المنتجع...');
  const {data,error}=await supabaseClient
    .from(PORTAL_RESORT_INFO_TABLE)
    .select('*')
    .eq('id','main')
    .maybeSingle();
  if(error){
    console.error(error);
    fillPortalResortInfo();
    portalInfoStatus('تعذر تحميل البيانات المركزية. تأكد من تطبيق Migration على البيئة المعتمدة.','error');
    return;
  }
  fillPortalResortInfo(data);
  portalInfoStatus(data?'تم تحميل معلومات المنتجع.':'تم عرض القيم الافتراضية حتى يتم الحفظ لأول مرة.','success');
}

function validatePortalResortInfo(payload){
  if(!payload.resort_name)return 'اسم المنتجع مطلوب.';
  if(!payload.short_description)return 'الوصف المختصر مطلوب.';
  if(!payload.detailed_description)return 'الوصف التفصيلي مطلوب.';
  if(!payload.checkin_time||!payload.checkout_time)return 'وقت الدخول ووقت الخروج مطلوبان.';
  for(const key of ['maps_url','whatsapp_url','instagram_url']){
    if(payload[key]&&!/^https:\/\//i.test(payload[key]))return 'روابط التواصل والخرائط يجب أن تبدأ بـ https://';
  }
  if(!payload.closed_message)return 'رسالة إيقاف استقبال الطلبات مطلوبة.';
  return '';
}

async function savePortalResortInfo(event){
  event.preventDefault();
  if(!window.supabaseClient){
    portalInfoStatus('تعذر الحفظ: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  const payload={
    id:'main',
    resort_name:portalReadValue('portalResortName'),
    short_description:portalReadValue('portalShortDescription'),
    detailed_description:portalReadValue('portalDetailedDescription'),
    checkin_time:portalReadValue('portalCheckinTime'),
    checkout_time:portalReadValue('portalCheckoutTime'),
    maps_url:portalReadValue('portalMapsUrl'),
    whatsapp_url:portalReadValue('portalWhatsappUrl'),
    instagram_url:portalReadValue('portalInstagramUrl'),
    resort_address:portalReadValue('portalAddress'),
    checkin_instructions:portalReadValue('portalCheckinInstructions'),
    features:portalResortFeatures,
    booking_requests_open:portalReadValue('portalRequestsOpen')==='true',
    closed_message:portalReadValue('portalClosedMessage'),
    updated_by:currentUser?.id||null
  };
  const validation=validatePortalResortInfo(payload);
  if(validation){
    portalInfoStatus(validation,'error');
    return;
  }
  const form=document.getElementById('portalResortInfoForm');
  form?.classList.add('portal-busy');
  portalInfoStatus('جاري حفظ معلومات المنتجع...');
  const {error}=await supabaseClient.from(PORTAL_RESORT_INFO_TABLE).upsert(payload);
  form?.classList.remove('portal-busy');
  if(error){
    console.error(error);
    portalInfoStatus('تعذر حفظ معلومات المنتجع. لم يتم تغيير البيانات الحالية.','error');
    return;
  }
  portalInfoStatus('تم حفظ معلومات المنتجع بنجاح.','success');
}

function validatePortalImageFile(file){
  if(!file)return 'اختر صورة قبل الحفظ.';
  const name=String(file.name||'').toLowerCase();
  if(name.endsWith('.heic')||name.endsWith('.heif'))return 'صيغة HEIC غير مدعومة حاليًا. فضلاً حول الصورة إلى JPG أو PNG ثم أعد الرفع.';
  if(file.size>PORTAL_IMAGE_MAX_BYTES)return 'حجم الصورة يتجاوز 10MB.';
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))return 'نوع الملف غير مدعوم. الصيغ المقبولة: JPG وJPEG وPNG وWebP فقط.';
  return '';
}

function resizePortalImage(file){
  return new Promise((resolve,reject)=>{
    const validation=validatePortalImageFile(file);
    if(validation){
      reject(new Error(validation));
      return;
    }
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('تعذر فتح الصورة. تأكد أن الملف صورة سليمة.'));
      img.onload=()=>{
        const scale=Math.min(1,PORTAL_IMAGE_MAX_EDGE/Math.max(img.width,img.height));
        const width=Math.max(1,Math.round(img.width*scale));
        const height=Math.max(1,Math.round(img.height*scale));
        const canvas=document.createElement('canvas');
        canvas.width=width;
        canvas.height=height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,width,height);
        canvas.toBlob(blob=>{
          if(!blob){
            reject(new Error('تعذر تحسين الصورة للويب.'));
            return;
          }
          resolve(blob);
        },'image/webp',0.86);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function previewPortalImages(){
  const input=document.getElementById('portalImageFile');
  const preview=document.getElementById('portalImagePreview');
  const files=[...(input?.files||[])];
  portalSelectedImages.forEach(item=>URL.revokeObjectURL(item.previewUrl));
  portalSelectedImages=[];
  if(!preview)return;
  if(!files.length){
    preview.textContent='اختر صور JPG أو PNG أو WebP لمعاينتها قبل الرفع.';
    return;
  }
  portalImageStatus(`جاري تجهيز ${files.length} صورة...`);
  const errors=[];
  for(const file of files){
    try{
      const blob=await resizePortalImage(file);
      portalSelectedImages.push({file,blob,previewUrl:URL.createObjectURL(blob)});
    }catch(error){
      console.error(error);
      errors.push(`${file.name}: ${error.message}`);
    }
  }
  renderPortalImagePreviews();
  if(errors.length)portalImageStatus(`تم تجهيز ${portalSelectedImages.length} صورة، وتعذر تجهيز ${errors.length}: ${errors.join(' | ')}`,'error');
  else portalImageStatus(`تم تجهيز ${portalSelectedImages.length} صورة للرفع. الحجم محسّن بصيغة WebP.`,'success');
}

function renderPortalImagePreviews(){
  const preview=document.getElementById('portalImagePreview');
  if(!preview)return;
  if(!portalSelectedImages.length){
    preview.textContent='اختر صور JPG أو PNG أو WebP لمعاينتها قبل الرفع.';
    return;
  }
  preview.innerHTML=portalSelectedImages.map((item,index)=>`
    <article class="portal-preview-item">
      <img src="${item.previewUrl}" alt="معاينة ${escapeHtml(item.file.name)}">
      <button type="button" onclick="removePortalImagePreview(${index})" aria-label="إزالة الصورة من قائمة الرفع">×</button>
      <div class="meta">${escapeHtml(item.file.name)}<br>${Math.round(item.blob.size/1024)} KB</div>
    </article>
  `).join('');
}

function removePortalImagePreview(index){
  const [removed]=portalSelectedImages.splice(index,1);
  if(removed)URL.revokeObjectURL(removed.previewUrl);
  renderPortalImagePreviews();
  portalImageStatus(portalSelectedImages.length?`متبقي ${portalSelectedImages.length} صورة جاهزة للرفع.`:'تم إفراغ قائمة الرفع.',portalSelectedImages.length?'success':'');
}

function portalImagePathFromUrl(url){
  const marker=`/${PORTAL_IMAGES_BUCKET}/`;
  const index=String(url||'').indexOf(marker);
  if(index===-1)return '';
  return decodeURIComponent(String(url).slice(index+marker.length).split('?')[0]);
}

function buildPortalImagePath(file){
  const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  const safeName=String(file?.name||'image').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,42)||'image';
  return `portal/${stamp}-${Math.random().toString(36).slice(2,8)}-${safeName}.webp`;
}

async function uploadPortalImages(event){
  event.preventDefault();
  if(!window.supabaseClient){
    portalImageStatus('تعذر الرفع: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  if(!portalSelectedImages.length){
    portalImageStatus('اختر صورة واحدة أو أكثر وانتظر ظهور المعاينة قبل الرفع.','error');
    return;
  }
  const category=portalReadValue('portalImageCategory')||'general';
  if(!PORTAL_IMAGE_CATEGORIES.includes(category)){
    portalImageStatus('تصنيف الصورة غير معتمد.','error');
    return;
  }
  const form=document.getElementById('portalImageUploadForm');
  form?.classList.add('portal-busy');
  const shouldSetCover=document.getElementById('portalImageIsCover')?.checked===true;
  if(shouldSetCover){
    const coverReset=await supabaseClient
      .from(PORTAL_IMAGES_TABLE)
      .update({is_cover:false,updated_by:currentUser?.id||null})
      .eq('category',category);
    if(coverReset.error){
      console.error(coverReset.error);
      form?.classList.remove('portal-busy');
      portalImageStatus('تعذر تجهيز صورة الغلاف. لم يتم رفع أي ملف.','error');
      return;
    }
  }
  const items=[...portalSelectedImages];
  const baseOrder=portalImages.length?Math.max(...portalImages.map(img=>Number(img.display_order)||0))+1:1;
  const customTitle=portalReadValue('portalImageTitle');
  let completed=0;
  const errors=[];
  for(let index=0;index<items.length;index+=1){
    const item=items[index];
    portalImageStatus(`جاري رفع الصورة ${index+1} من ${items.length}...`);
    const path=buildPortalImagePath(item.file);
    const upload=await supabaseClient.storage.from(PORTAL_IMAGES_BUCKET).upload(path,item.blob,{contentType:'image/webp',upsert:false});
    if(upload.error){
      console.error(upload.error);
      errors.push(item.file.name);
      continue;
    }
    const {data:publicData}=supabaseClient.storage.from(PORTAL_IMAGES_BUCKET).getPublicUrl(path);
    const payload={
      category,
      title:customTitle?(items.length===1?customTitle:`${customTitle} ${index+1}`):`صورة منتجع أضواء الشرق ${baseOrder+index}`,
      description:portalReadValue('portalImageDescription'),
      image_alt:portalReadValue('portalImageAlt'),
      image_url:publicData.publicUrl,
      display_order:baseOrder+index,
      is_cover:shouldSetCover&&index===0,
      is_visible:document.getElementById('portalImageIsVisible')?.checked!==false,
      updated_by:currentUser?.id||null
    };
    const insert=await supabaseClient.from(PORTAL_IMAGES_TABLE).insert(payload);
    if(insert.error){
      console.error(insert.error);
      await supabaseClient.storage.from(PORTAL_IMAGES_BUCKET).remove([path]);
      errors.push(item.file.name);
      continue;
    }
    completed+=1;
  }
  portalSelectedImages.forEach(item=>URL.revokeObjectURL(item.previewUrl));
  form?.reset();
  document.getElementById('portalImageIsVisible').checked=true;
  document.getElementById('portalImagePreview').textContent='اختر صور JPG أو PNG أو WebP لمعاينتها قبل الرفع.';
  portalSelectedImages=[];
  form?.classList.remove('portal-busy');
  portalImageStatus(errors.length?`تم رفع ${completed} صورة، وتعذر رفع ${errors.length}: ${errors.join('، ')}.`:`تم رفع الصور وحفظها بنجاح (${completed}).`,errors.length?'error':'success');
  await loadPortalImages();
}

async function loadPortalImages(){
  if(!window.supabaseClient){
    portalImageStatus('تعذر تحميل الصور: الاتصال بقاعدة البيانات غير مهيأ.','error');
    renderPortalImages();
    return;
  }
  portalImageStatus('جاري تحميل الصور...');
  const {data,error}=await supabaseClient
    .from(PORTAL_IMAGES_TABLE)
    .select('*')
    .order('display_order',{ascending:true})
    .order('created_at',{ascending:true});
  if(error){
    console.error(error);
    portalImages=[];
    renderPortalImages();
    portalImageStatus('تعذر تحميل الصور. تأكد من تطبيق Migration الصور على البيئة المعتمدة.','error');
    return;
  }
  portalImages=Array.isArray(data)?data:[];
  renderPortalImages();
  portalImageStatus(portalImages.length?'تم تحميل الصور.':'لا توجد صور محفوظة بعد.','success');
}

function renderPortalImages(){
  const root=document.getElementById('portalImagesList');
  if(!root)return;
  if(!portalImages.length){
    root.innerHTML='<div class="portal-empty-inline">لم تتم إضافة صور للبوابة بعد.</div>';
    return;
  }
  root.innerHTML=portalImages.map((image,index)=>`
    <article class="portal-image-item ${image.is_visible?'':'portal-image-hidden'}" draggable="true" data-portal-image-id="${image.id}" ondragstart="startPortalImageDrag(event,'${image.id}')" ondragend="endPortalImageDrag(event)" ondragover="allowPortalImageDrop(event)" ondragleave="leavePortalImageDrop(event)" ondrop="dropPortalImage(event,'${image.id}')">
      <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.image_alt||image.title||'صورة من منتجع أضواء الشرق')}" loading="lazy">
      <div class="portal-image-editor">
        <div class="portal-image-flags">
          ${image.is_cover?'<span class="portal-image-flag cover">صورة الغلاف</span>':''}
          ${image.is_visible?'<span class="portal-image-flag visible">ظاهرة</span>':'<span class="portal-image-flag hidden">مخفية</span>'}
        </div>
        <label>التصنيف
          <select data-portal-image-category onchange="updatePortalImageDraft('${image.id}','category',this.value)"></select>
        </label>
        <label>العنوان
          <input value="${escapeHtml(image.title||'')}" maxlength="140" oninput="updatePortalImageDraft('${image.id}','title',this.value)">
        </label>
        <label>الوصف
          <textarea maxlength="500" oninput="updatePortalImageDraft('${image.id}','description',this.value)">${escapeHtml(image.description||'')}</textarea>
        </label>
        <label>Alt Text
          <input value="${escapeHtml(image.image_alt||'')}" maxlength="180" oninput="updatePortalImageDraft('${image.id}','image_alt',this.value)">
        </label>
        <div class="portal-image-actions">
          <button class="secondary" type="button" onclick="movePortalImage('${image.id}',-1)" ${index===0?'disabled':''}>أعلى</button>
          <button class="secondary" type="button" onclick="movePortalImage('${image.id}',1)" ${index===portalImages.length-1?'disabled':''}>أسفل</button>
          <button class="secondary" type="button" onclick="savePortalImageMeta('${image.id}')">حفظ</button>
          <button class="secondary" type="button" onclick="setPortalImageCover('${image.id}')">غلاف</button>
          <button class="secondary" type="button" onclick="togglePortalImageVisibility('${image.id}')">${image.is_visible?'إخفاء':'إظهار'}</button>
          <button class="danger" type="button" onclick="deletePortalImage('${image.id}')">حذف</button>
        </div>
      </div>
    </article>
  `).join('');
  renderPortalImageCategoryOptions();
  portalImages.forEach(image=>{
    const select=root.querySelector(`select[onchange*="${image.id}"]`);
    if(select)select.value=image.category||'general';
  });
}

function startPortalImageDrag(event,id){
  portalDraggedImageId=id;
  event.currentTarget.classList.add('portal-image-dragging');
  event.dataTransfer.effectAllowed='move';
}

function allowPortalImageDrop(event){
  event.preventDefault();
  event.currentTarget.classList.add('portal-image-drop-target');
}

function leavePortalImageDrop(event){
  event.currentTarget.classList.remove('portal-image-drop-target');
}

function endPortalImageDrag(event){
  event.currentTarget.classList.remove('portal-image-dragging');
  document.querySelectorAll('.portal-image-drop-target').forEach(item=>item.classList.remove('portal-image-drop-target'));
}

async function dropPortalImage(event,targetId){
  event.preventDefault();
  leavePortalImageDrop(event);
  const sourceIndex=portalImages.findIndex(item=>item.id===portalDraggedImageId);
  const targetIndex=portalImages.findIndex(item=>item.id===targetId);
  if(sourceIndex<0||targetIndex<0||sourceIndex===targetIndex)return;
  const [moved]=portalImages.splice(sourceIndex,1);
  portalImages.splice(targetIndex,0,moved);
  renderPortalImages();
  portalImageStatus('جاري حفظ ترتيب الصور...');
  for(let index=0;index<portalImages.length;index+=1){
    const {error}=await supabaseClient.from(PORTAL_IMAGES_TABLE).update({display_order:index+1,updated_by:currentUser?.id||null}).eq('id',portalImages[index].id);
    if(error){
      console.error(error);
      portalImageStatus('تعذر حفظ ترتيب الصور بالكامل. أعد تحميل الصور وحاول مرة أخرى.','error');
      await loadPortalImages();
      return;
    }
  }
  portalImageStatus('تم حفظ ترتيب الصور.','success');
  await loadPortalImages();
}

function updatePortalImageDraft(id,key,value){
  const image=portalImages.find(item=>item.id===id);
  if(!image)return;
  image[key]=value;
}

async function savePortalImageMeta(id){
  const image=portalImages.find(item=>item.id===id);
  if(!image)return;
  if(!PORTAL_IMAGE_CATEGORIES.includes(image.category)){
    portalImageStatus('تصنيف الصورة غير معتمد.','error');
    return;
  }
  portalImageStatus('جاري حفظ بيانات الصورة...');
  const {error}=await supabaseClient.from(PORTAL_IMAGES_TABLE).update({
    category:image.category,
    title:String(image.title||'').trim(),
    description:String(image.description||'').trim(),
    image_alt:String(image.image_alt||'').trim(),
    display_order:Number(image.display_order)||0,
    updated_by:currentUser?.id||null
  }).eq('id',id);
  if(error){
    console.error(error);
    portalImageStatus('تعذر حفظ بيانات الصورة.','error');
    return;
  }
  portalImageStatus('تم حفظ بيانات الصورة.','success');
  await loadPortalImages();
}

async function setPortalImageCover(id){
  const image=portalImages.find(item=>item.id===id);
  if(!image)return;
  portalImageStatus('جاري تعيين صورة الغلاف...');
  const reset=await supabaseClient
    .from(PORTAL_IMAGES_TABLE)
    .update({is_cover:false,updated_by:currentUser?.id||null})
    .eq('category',image.category||'general')
    .neq('id',id);
  if(reset.error){
    console.error(reset.error);
    portalImageStatus('تعذر تحديث صورة الغلاف.','error');
    return;
  }
  const set=await supabaseClient.from(PORTAL_IMAGES_TABLE).update({is_cover:true,updated_by:currentUser?.id||null}).eq('id',id);
  if(set.error){
    console.error(set.error);
    portalImageStatus('تعذر تعيين صورة الغلاف.','error');
    return;
  }
  portalImageStatus('تم تعيين صورة الغلاف.','success');
  await loadPortalImages();
}

async function togglePortalImageVisibility(id){
  const image=portalImages.find(item=>item.id===id);
  if(!image)return;
  const {error}=await supabaseClient.from(PORTAL_IMAGES_TABLE).update({
    is_visible:!image.is_visible,
    updated_by:currentUser?.id||null
  }).eq('id',id);
  if(error){
    console.error(error);
    portalImageStatus('تعذر تغيير حالة ظهور الصورة.','error');
    return;
  }
  portalImageStatus('تم تحديث حالة ظهور الصورة.','success');
  await loadPortalImages();
}

async function movePortalImage(id,direction){
  const index=portalImages.findIndex(item=>item.id===id);
  const otherIndex=index+direction;
  if(index<0||otherIndex<0||otherIndex>=portalImages.length)return;
  const current=portalImages[index];
  const other=portalImages[otherIndex];
  const currentOrder=Number(current.display_order)||index+1;
  const otherOrder=Number(other.display_order)||otherIndex+1;
  portalImageStatus('جاري تحديث ترتيب الصور...');
  const first=await supabaseClient.from(PORTAL_IMAGES_TABLE).update({display_order:otherOrder,updated_by:currentUser?.id||null}).eq('id',current.id);
  const second=first.error?first:await supabaseClient.from(PORTAL_IMAGES_TABLE).update({display_order:currentOrder,updated_by:currentUser?.id||null}).eq('id',other.id);
  if(first.error||second.error){
    console.error(first.error||second.error);
    portalImageStatus('تعذر تحديث ترتيب الصور.','error');
    return;
  }
  portalImageStatus('تم تحديث ترتيب الصور.','success');
  await loadPortalImages();
}

async function deletePortalImage(id){
  const image=portalImages.find(item=>item.id===id);
  if(!image||!confirm('حذف هذه الصورة من بوابة العملاء؟'))return;
  portalImageStatus('جاري حذف الصورة...');
  const dbDelete=await supabaseClient.from(PORTAL_IMAGES_TABLE).delete().eq('id',id);
  if(dbDelete.error){
    console.error(dbDelete.error);
    portalImageStatus('تعذر حذف سجل الصورة. لم يتم حذف ملف التخزين.','error');
    return;
  }
  const path=portalImagePathFromUrl(image.image_url);
  if(path){
    const storageDelete=await supabaseClient.storage.from(PORTAL_IMAGES_BUCKET).remove([path]);
    if(storageDelete.error){
      console.error(storageDelete.error);
      portalImageStatus('حُذف سجل الصورة، لكن تعذر حذف ملف التخزين. راجع التخزين لاحقًا.','error');
      await loadPortalImages();
      return;
    }
  }
  portalImageStatus('تم حذف الصورة.','success');
  await loadPortalImages();
}

function updatePortalUnavailablePreview(){
  const start=portalReadValue('portalUnavailableStart');
  const end=portalReadValue('portalUnavailableEnd');
  const preview=document.getElementById('portalUnavailablePreview');
  if(!preview)return;
  if(!start||!end){
    preview.textContent='اختر بداية ونهاية الفترة لعرض التاريخين بالميلادي والهجري.';
    return;
  }
  preview.innerHTML=`
    <div><b>البداية:</b> ${escapeHtml(portalFormatGregorian(start))} — ${escapeHtml(portalFormatHijri(start))}</div>
    <div><b>النهاية:</b> ${escapeHtml(portalFormatGregorian(end))} — ${escapeHtml(portalFormatHijri(end))}</div>
  `;
}

function resetPortalUnavailableForm(){
  portalSetValue('portalUnavailableId','');
  portalSetValue('portalUnavailableStart','');
  portalSetValue('portalUnavailableEnd','');
  updatePortalUnavailablePreview();
  portalUnavailableStatus('جاهز لإضافة فترة غير متاحة.');
}

function validatePortalUnavailablePeriod(payload){
  if(!payload.start_date||!payload.end_date)return 'تاريخ البداية والنهاية مطلوبان.';
  if(portalDateDays(payload.start_date)>portalDateDays(payload.end_date))return 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساويًا له.';
  const overlap=portalUnavailablePeriods.find(period=>
    period.id!==payload.id&&portalRangesOverlap(payload.start_date,payload.end_date,period.start_date,period.end_date)
  );
  if(overlap)return 'هذه الفترة تتداخل مع فترة غير متاحة محفوظة. عدّل الفترة الحالية أو اختر تاريخًا آخر.';
  return '';
}

async function loadPortalUnavailablePeriods(){
  if(!window.supabaseClient){
    portalUnavailableStatus('تعذر تحميل الفترات: الاتصال بقاعدة البيانات غير مهيأ.','error');
    renderPortalUnavailablePeriods();
    return;
  }
  portalUnavailableStatus('جاري تحميل الفترات غير المتاحة...');
  const {data,error}=await supabaseClient
    .from(PORTAL_UNAVAILABLE_TABLE)
    .select('*')
    .order('start_date',{ascending:true})
    .order('end_date',{ascending:true});
  if(error){
    console.error(error);
    portalUnavailablePeriods=[];
    renderPortalUnavailablePeriods();
    portalUnavailableStatus('تعذر تحميل الفترات. تأكد من تطبيق Migration التواريخ غير المتاحة.','error');
    return;
  }
  portalUnavailablePeriods=Array.isArray(data)?data:[];
  renderPortalUnavailablePeriods();
  portalUnavailableStatus(portalUnavailablePeriods.length?'تم تحميل الفترات غير المتاحة.':'لا توجد فترات غير متاحة محفوظة.','success');
}

function renderPortalUnavailablePeriods(){
  const root=document.getElementById('portalUnavailableList');
  if(!root)return;
  if(!portalUnavailablePeriods.length){
    root.innerHTML='<div class="portal-empty-inline">لا توجد فترات غير متاحة محفوظة بعد.</div>';
    return;
  }
  root.innerHTML=portalUnavailablePeriods.map(period=>`
    <article class="portal-unavailable-item">
      <div>
        <h4>${escapeHtml(period.start_date)} إلى ${escapeHtml(period.end_date)}</h4>
        <div class="meta">البداية: ${escapeHtml(portalFormatGregorian(period.start_date))}</div>
        <div class="meta">هجريًا: ${escapeHtml(portalFormatHijri(period.start_date))}</div>
        <div class="meta">النهاية: ${escapeHtml(portalFormatGregorian(period.end_date))}</div>
        <div class="meta">هجريًا: ${escapeHtml(portalFormatHijri(period.end_date))}</div>
      </div>
      <div class="portal-unavailable-actions">
        <button class="secondary" type="button" onclick="editPortalUnavailablePeriod('${period.id}')">تعديل</button>
        <button class="danger" type="button" onclick="deletePortalUnavailablePeriod('${period.id}')">حذف</button>
      </div>
    </article>
  `).join('');
}

function editPortalUnavailablePeriod(id){
  const period=portalUnavailablePeriods.find(item=>item.id===id);
  if(!period)return;
  portalSetValue('portalUnavailableId',period.id);
  portalSetValue('portalUnavailableStart',period.start_date);
  portalSetValue('portalUnavailableEnd',period.end_date);
  updatePortalUnavailablePreview();
  portalUnavailableStatus('أنت تعدل فترة محفوظة. احفظ التعديل أو اضغط إلغاء التعديل.');
}

async function savePortalUnavailablePeriod(event){
  event.preventDefault();
  if(!window.supabaseClient){
    portalUnavailableStatus('تعذر الحفظ: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  const id=portalReadValue('portalUnavailableId');
  const payload={
    id,
    start_date:portalReadValue('portalUnavailableStart'),
    end_date:portalReadValue('portalUnavailableEnd'),
    updated_by:currentUser?.id||null
  };
  const validation=validatePortalUnavailablePeriod(payload);
  if(validation){
    portalUnavailableStatus(validation,'error');
    return;
  }
  const form=document.getElementById('portalUnavailableForm');
  form?.classList.add('portal-busy');
  portalUnavailableStatus('جاري حفظ الفترة...');
  const query=id
    ?supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).update({
      start_date:payload.start_date,
      end_date:payload.end_date,
      updated_by:payload.updated_by
    }).eq('id',id)
    :supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).insert({
      start_date:payload.start_date,
      end_date:payload.end_date,
      updated_by:payload.updated_by
    });
  const {error}=await query;
  form?.classList.remove('portal-busy');
  if(error){
    console.error(error);
    const message=String(error.message||'');
    portalUnavailableStatus(message.includes('overlap')||message.includes('conflict')?'هذه الفترة تتداخل مع فترة محفوظة.':'تعذر حفظ الفترة غير المتاحة.','error');
    return;
  }
  resetPortalUnavailableForm();
  portalUnavailableStatus('تم حفظ الفترة غير المتاحة.','success');
  await loadPortalUnavailablePeriods();
}

async function deletePortalUnavailablePeriod(id){
  if(!confirm('حذف هذه الفترة غير المتاحة؟'))return;
  portalUnavailableStatus('جاري حذف الفترة...');
  const {error}=await supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).delete().eq('id',id);
  if(error){
    console.error(error);
    portalUnavailableStatus('تعذر حذف الفترة.','error');
    return;
  }
  resetPortalUnavailableForm();
  portalUnavailableStatus('تم حذف الفترة.','success');
  await loadPortalUnavailablePeriods();
}

function portalReadMoney(id){
  const value=Number(portalReadValue(id));
  return Number.isFinite(value)?value:NaN;
}

function validatePortalMoney(value,label){
  if(!Number.isFinite(value))return `${label} مطلوب.`;
  if(value<0)return `${label} لا يمكن أن يكون أقل من صفر.`;
  return '';
}

async function loadPortalPricing(){
  if(!window.supabaseClient){
    portalPricingStatus('تعذر تحميل الأسعار: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  portalPricingStatus('جاري تحميل الأسعار الأساسية...');
  const {data,error}=await supabaseClient
    .from(PORTAL_PRICING_TABLE)
    .select('*')
    .eq('id','main')
    .maybeSingle();
  if(error){
    console.error(error);
    portalPricingStatus('تعذر تحميل الأسعار. تأكد من تطبيق Migration الأسعار.','error');
    return;
  }
  portalSetValue('portalWeekdayPrice',data?.weekday_price??'');
  portalSetValue('portalWeekendPrice',data?.weekend_price??'');
  portalPricingStatus(data?'تم تحميل الأسعار الأساسية.':'لا توجد أسعار محفوظة بعد.','success');
}

async function savePortalPricing(event){
  event.preventDefault();
  if(!window.supabaseClient){
    portalPricingStatus('تعذر الحفظ: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  const weekday=portalReadMoney('portalWeekdayPrice');
  const weekend=portalReadMoney('portalWeekendPrice');
  const validation=validatePortalMoney(weekday,'سعر أيام الأسبوع')||validatePortalMoney(weekend,'سعر نهاية الأسبوع');
  if(validation){
    portalPricingStatus(validation,'error');
    return;
  }
  const form=document.getElementById('portalPricingForm');
  form?.classList.add('portal-busy');
  portalPricingStatus('جاري حفظ الأسعار الأساسية...');
  const {error}=await supabaseClient.from(PORTAL_PRICING_TABLE).upsert({
    id:'main',
    weekday_price:weekday,
    weekend_price:weekend,
    updated_by:currentUser?.id||null
  });
  form?.classList.remove('portal-busy');
  if(error){
    console.error(error);
    portalPricingStatus('تعذر حفظ الأسعار الأساسية.','error');
    return;
  }
  portalPricingStatus('تم حفظ الأسعار الأساسية.','success');
}

function updatePortalSeasonPreview(){
  const start=portalReadValue('portalSeasonStart');
  const end=portalReadValue('portalSeasonEnd');
  const preview=document.getElementById('portalSeasonPreview');
  if(!preview)return;
  if(!start||!end){
    preview.textContent='اختر بداية ونهاية الموسم لعرض التاريخين بالميلادي والهجري.';
    return;
  }
  preview.innerHTML=`
    <div><b>البداية:</b> ${escapeHtml(portalFormatGregorian(start))} — ${escapeHtml(portalFormatHijri(start))}</div>
    <div><b>النهاية:</b> ${escapeHtml(portalFormatGregorian(end))} — ${escapeHtml(portalFormatHijri(end))}</div>
  `;
}

function resetPortalSeasonForm(){
  portalSetValue('portalSeasonId','');
  portalSetValue('portalSeasonName','');
  portalSetValue('portalSeasonPrice','');
  portalSetValue('portalSeasonStart','');
  portalSetValue('portalSeasonEnd','');
  const active=document.getElementById('portalSeasonActive');
  if(active)active.checked=true;
  updatePortalSeasonPreview();
  portalSeasonsStatus('جاهز لإضافة موسم.');
}

function validatePortalSeason(payload){
  if(!payload.season_name)return 'اسم الموسم مطلوب.';
  const priceValidation=validatePortalMoney(payload.season_price,'سعر الموسم');
  if(priceValidation)return priceValidation;
  if(!payload.start_date||!payload.end_date)return 'تاريخ بداية ونهاية الموسم مطلوبان.';
  if(portalDateDays(payload.start_date)>portalDateDays(payload.end_date))return 'تاريخ نهاية الموسم يجب أن يكون بعد البداية أو مساويًا لها.';
  const overlap=portalSeasons.find(season=>
    season.id!==payload.id&&portalRangesOverlap(payload.start_date,payload.end_date,season.start_date,season.end_date)
  );
  if(overlap)return 'هذا الموسم يتداخل مع موسم محفوظ. عدّل الموسم الحالي أو اختر فترة أخرى.';
  return '';
}

async function loadPortalSeasons(){
  if(!window.supabaseClient){
    portalSeasonsStatus('تعذر تحميل المواسم: الاتصال بقاعدة البيانات غير مهيأ.','error');
    renderPortalSeasons();
    return;
  }
  portalSeasonsStatus('جاري تحميل المواسم...');
  const {data,error}=await supabaseClient
    .from(PORTAL_SEASONS_TABLE)
    .select('*')
    .order('start_date',{ascending:true})
    .order('end_date',{ascending:true});
  if(error){
    console.error(error);
    portalSeasons=[];
    renderPortalSeasons();
    portalSeasonsStatus('تعذر تحميل المواسم. تأكد من تطبيق Migration المواسم.','error');
    return;
  }
  portalSeasons=Array.isArray(data)?data:[];
  renderPortalSeasons();
  portalSeasonsStatus(portalSeasons.length?'تم تحميل المواسم.':'لا توجد مواسم محفوظة بعد.','success');
}

function renderPortalSeasons(){
  const root=document.getElementById('portalSeasonsList');
  if(!root)return;
  if(!portalSeasons.length){
    root.innerHTML='<div class="portal-empty-inline">لا توجد مواسم محفوظة بعد.</div>';
    return;
  }
  root.innerHTML=portalSeasons.map(season=>`
    <article class="portal-season-item ${season.is_active?'':'portal-season-inactive'}">
      <div>
        <h4>${escapeHtml(season.season_name)}</h4>
        <div class="meta">الفترة: ${escapeHtml(season.start_date)} إلى ${escapeHtml(season.end_date)}</div>
        <div class="meta">البداية: ${escapeHtml(portalFormatGregorian(season.start_date))} — ${escapeHtml(portalFormatHijri(season.start_date))}</div>
        <div class="meta">النهاية: ${escapeHtml(portalFormatGregorian(season.end_date))} — ${escapeHtml(portalFormatHijri(season.end_date))}</div>
        <div class="meta">السعر: ${Number(season.season_price).toLocaleString('ar-SA')} ريال • ${season.is_active?'مفعّل':'متوقف'}</div>
      </div>
      <div class="portal-season-actions">
        <button class="secondary" type="button" onclick="editPortalSeason('${season.id}')">تعديل</button>
        <button class="secondary" type="button" onclick="togglePortalSeason('${season.id}')">${season.is_active?'إيقاف':'تفعيل'}</button>
        <button class="danger" type="button" onclick="deletePortalSeason('${season.id}')">حذف</button>
      </div>
    </article>
  `).join('');
}

function editPortalSeason(id){
  const season=portalSeasons.find(item=>item.id===id);
  if(!season)return;
  portalSetValue('portalSeasonId',season.id);
  portalSetValue('portalSeasonName',season.season_name);
  portalSetValue('portalSeasonPrice',season.season_price);
  portalSetValue('portalSeasonStart',season.start_date);
  portalSetValue('portalSeasonEnd',season.end_date);
  const active=document.getElementById('portalSeasonActive');
  if(active)active.checked=season.is_active!==false;
  updatePortalSeasonPreview();
  portalSeasonsStatus('أنت تعدل موسمًا محفوظًا. احفظ التعديل أو اضغط إلغاء التعديل.');
}

async function savePortalSeason(event){
  event.preventDefault();
  if(!window.supabaseClient){
    portalSeasonsStatus('تعذر الحفظ: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  const id=portalReadValue('portalSeasonId');
  const payload={
    id,
    season_name:portalReadValue('portalSeasonName'),
    season_price:portalReadMoney('portalSeasonPrice'),
    start_date:portalReadValue('portalSeasonStart'),
    end_date:portalReadValue('portalSeasonEnd'),
    is_active:document.getElementById('portalSeasonActive')?.checked===true,
    updated_by:currentUser?.id||null
  };
  const validation=validatePortalSeason(payload);
  if(validation){
    portalSeasonsStatus(validation,'error');
    return;
  }
  const form=document.getElementById('portalSeasonForm');
  form?.classList.add('portal-busy');
  portalSeasonsStatus('جاري حفظ الموسم...');
  const record={
    season_name:payload.season_name,
    season_price:payload.season_price,
    start_date:payload.start_date,
    end_date:payload.end_date,
    is_active:payload.is_active,
    updated_by:payload.updated_by
  };
  const {error}=id
    ?await supabaseClient.from(PORTAL_SEASONS_TABLE).update(record).eq('id',id)
    :await supabaseClient.from(PORTAL_SEASONS_TABLE).insert(record);
  form?.classList.remove('portal-busy');
  if(error){
    console.error(error);
    const message=String(error.message||'');
    portalSeasonsStatus(message.includes('overlap')||message.includes('conflict')?'هذا الموسم يتداخل مع موسم محفوظ.':'تعذر حفظ الموسم.','error');
    return;
  }
  resetPortalSeasonForm();
  portalSeasonsStatus('تم حفظ الموسم.','success');
  await loadPortalSeasons();
}

async function togglePortalSeason(id){
  const season=portalSeasons.find(item=>item.id===id);
  if(!season)return;
  portalSeasonsStatus('جاري تحديث حالة الموسم...');
  const {error}=await supabaseClient.from(PORTAL_SEASONS_TABLE).update({
    is_active:!season.is_active,
    updated_by:currentUser?.id||null
  }).eq('id',id);
  if(error){
    console.error(error);
    portalSeasonsStatus('تعذر تحديث حالة الموسم.','error');
    return;
  }
  portalSeasonsStatus('تم تحديث حالة الموسم.','success');
  await loadPortalSeasons();
}

async function deletePortalSeason(id){
  if(!confirm('حذف هذا الموسم؟'))return;
  portalSeasonsStatus('جاري حذف الموسم...');
  const {error}=await supabaseClient.from(PORTAL_SEASONS_TABLE).delete().eq('id',id);
  if(error){
    console.error(error);
    portalSeasonsStatus('تعذر حذف الموسم.','error');
    return;
  }
  resetPortalSeasonForm();
  portalSeasonsStatus('تم حذف الموسم.','success');
  await loadPortalSeasons();
}

function validatePortalContact(payload){
  if(!payload.whatsapp_number)return 'رقم واتساب مطلوب.';
  if(!/^\d{8,15}$/.test(payload.whatsapp_number))return 'رقم واتساب يجب أن يحتوي أرقامًا فقط بصيغة دولية.';
  for(const [key,label] of [['maps_url','رابط خرائط Google'],['instagram_url','رابط إنستغرام']]){
    if(!payload[key]||!/^https:\/\//i.test(payload[key]))return `${label} يجب أن يبدأ بـ https://`;
  }
  if(payload.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))return 'صيغة البريد الإلكتروني غير صحيحة.';
  if(!payload.contact_hours)return 'أوقات التواصل مطلوبة.';
  return '';
}

async function loadPortalContact(){
  if(!window.supabaseClient){
    portalContactStatus('تعذر تحميل بيانات التواصل: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  portalContactStatus('جاري تحميل بيانات التواصل...');
  const {data,error}=await supabaseClient
    .from(PORTAL_CONTACT_TABLE)
    .select('*')
    .eq('id','main')
    .maybeSingle();
  if(error){
    console.error(error);
    portalContactStatus('تعذر تحميل بيانات التواصل. تأكد من تطبيق Migration التواصل.','error');
    return;
  }
  portalSetValue('portalContactWhatsapp',data?.whatsapp_number||'966560442799');
  portalSetValue('portalContactMapsUrl',data?.maps_url||'https://maps.app.goo.gl/uh8t93tMm5agNWvx7?g_st=com.google.maps.preview.copy');
  portalSetValue('portalContactInstagramUrl',data?.instagram_url||'https://www.instagram.com/adwaa_al_sharq_resort?igsh=ODg0Z3AxZnNld2Jx&utm_source=q');
  portalSetValue('portalContactEmail',data?.email||'');
  portalSetValue('portalContactHours',data?.contact_hours||'يوميًا حسب أوقات استقبال الطلبات المعتمدة من الإدارة.');
  portalContactStatus(data?'تم تحميل بيانات التواصل.':'تم عرض القيم الافتراضية حتى يتم الحفظ لأول مرة.','success');
}

async function savePortalContact(event){
  event.preventDefault();
  if(!window.supabaseClient){
    portalContactStatus('تعذر الحفظ: الاتصال بقاعدة البيانات غير مهيأ.','error');
    return;
  }
  const payload={
    id:'main',
    whatsapp_number:portalReadValue('portalContactWhatsapp').replace(/[^\d]/g,''),
    maps_url:portalReadValue('portalContactMapsUrl'),
    instagram_url:portalReadValue('portalContactInstagramUrl'),
    email:portalReadValue('portalContactEmail'),
    contact_hours:portalReadValue('portalContactHours'),
    updated_by:currentUser?.id||null
  };
  const validation=validatePortalContact(payload);
  if(validation){
    portalContactStatus(validation,'error');
    return;
  }
  const form=document.getElementById('portalContactForm');
  form?.classList.add('portal-busy');
  portalContactStatus('جاري حفظ بيانات التواصل...');
  const {error}=await supabaseClient.from(PORTAL_CONTACT_TABLE).upsert(payload);
  form?.classList.remove('portal-busy');
  if(error){
    console.error(error);
    portalContactStatus('تعذر حفظ بيانات التواصل.','error');
    return;
  }
  portalContactStatus('تم حفظ بيانات التواصل.','success');
}

document.addEventListener('DOMContentLoaded',()=>{
  renderPortalImageCategoryOptions();
  document.getElementById('portalAddFeatureButton')?.addEventListener('click',addPortalFeature);
  document.getElementById('portalFeatureInput')?.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      addPortalFeature();
    }
  });
  document.getElementById('portalImageFile')?.addEventListener('change',previewPortalImages);
  document.getElementById('portalUnavailableStart')?.addEventListener('change',updatePortalUnavailablePreview);
  document.getElementById('portalUnavailableEnd')?.addEventListener('change',updatePortalUnavailablePreview);
  document.getElementById('portalSeasonStart')?.addEventListener('change',updatePortalSeasonPreview);
  document.getElementById('portalSeasonEnd')?.addEventListener('change',updatePortalSeasonPreview);
  loadPortalResortInfo();
  loadPortalImages();
  loadPortalUnavailablePeriods();
  loadPortalPricing();
  loadPortalSeasons();
  loadPortalContact();
});
