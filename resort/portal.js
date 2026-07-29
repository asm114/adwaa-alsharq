const SUPABASE_URL='https://pgdvlklpyrvmwzitsmbw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_BFTIR_8VK2qQuKnl2c-jDA_cMnWz0E-';
const PORTAL_BUCKET='customer-portal-images';
const portalClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const defaultSettings={
  whatsapp_number:'966560442799',
  instagram_url:'https://www.instagram.com/adwaa_al_sharq_resort?igsh=ODg0Z3AxZnNld2Jx&utm_source=q',
  maps_url:'https://maps.app.goo.gl/uh8t93tMm5agNWvx7?g_st=com.google.maps.preview.copy',
  booking_requests_open:true,
  pause_message:'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا عبر واتساب للاستفسار.',
  daily_price:null,
  overnight_fee:100,
  overnight_enabled:true
};
let portalSettings={...defaultSettings};
let lastAvailability=null;

function money(value){
  return value===null||value===''||!Number.isFinite(Number(value))?'السعر غير متوفر حاليًا':`${Number(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ريال`;
}
function isoDate(date){return date.toISOString().slice(0,10)}
function addDays(iso,days){const date=new Date(`${iso}T12:00:00`);date.setDate(date.getDate()+days);return isoDate(date)}
function setConnectionStatus(message,type=''){
  portalConnectionStatus.textContent=message;
  portalConnectionStatus.className=`wrap portal-status ${type}`;
}
function applySettings(){
  dailyPrice.textContent=money(portalSettings.daily_price);
  overnightBase.textContent=money(portalSettings.daily_price);
  overnightFee.textContent=money(portalSettings.overnight_fee);
  overnightTotal.textContent=portalSettings.daily_price===null?'السعر غير متوفر حاليًا':money(Number(portalSettings.daily_price)+Number(portalSettings.overnight_fee));
  overnightPriceCard.hidden=!portalSettings.overnight_enabled;
  bookingType.querySelector('option[value="overnight"]').disabled=!portalSettings.overnight_enabled;
  if(!portalSettings.overnight_enabled&&bookingType.value==='overnight')bookingType.value='daily';
  const direct=`https://wa.me/${portalSettings.whatsapp_number}`;
  heroWhatsapp.href=direct;
  contactWhatsapp.href=direct;
  contactInstagram.href=portalSettings.instagram_url;
  contactMaps.href=portalSettings.maps_url;
  portalPauseBanner.hidden=portalSettings.booking_requests_open;
  portalPauseBanner.textContent=portalSettings.pause_message;
  whatsappRequestButton.disabled=!portalSettings.booking_requests_open;
  updateRequestSummary();
}
function renderGallery(images){
  if(!images.length){portalGallery.innerHTML='<div class="empty">لا توجد صور منشورة حاليًا.</div>';return}
  portalGallery.innerHTML=images.map(image=>{
    const url=portalClient.storage.from(PORTAL_BUCKET).getPublicUrl(image.storage_path).data.publicUrl;
    return `<figure><img src="${url}" alt="${escapeText(image.alt_text||'صورة من منتجع أضواء الشرق')}" loading="lazy"><figcaption>${escapeText(image.alt_text||'منتجع أضواء الشرق')}</figcaption></figure>`;
  }).join('');
  const hero=images.find(image=>image.is_hero)||images[0];
  const heroUrl=portalClient.storage.from(PORTAL_BUCKET).getPublicUrl(hero.storage_path).data.publicUrl;
  portalHero.style.backgroundImage=`url("${heroUrl.replace(/"/g,'%22')}")`;
}
function escapeText(value){const node=document.createElement('span');node.textContent=String(value||'');return node.innerHTML}
async function loadPortal(){
  const [{data:settings,error:settingsError},{data:images,error:imagesError}]=await Promise.all([
    portalClient.from('customer_portal_settings').select('*').eq('id','main').maybeSingle(),
    portalClient.from('customer_portal_images').select('id,storage_path,alt_text,sort_order,is_hero').eq('is_visible',true).order('sort_order').order('created_at')
  ]);
  if(settings)portalSettings={...defaultSettings,...settings};
  applySettings();
  if(!imagesError)renderGallery(images||[]);
  else renderGallery([]);
  if(settingsError||imagesError){
    setConnectionStatus('تعذر تحميل بعض البيانات المحدثة. لم تُعرض أسعار غير موثقة، ويمكن التواصل عبر الروابط المعتمدة.','error');
    console.error(settingsError||imagesError);
  }else setConnectionStatus('البيانات المعروضة محدثة من المصدر المركزي.','success');
}
function updateRequestSummary(){
  const overnight=bookingType.value==='overnight';
  daysField.hidden=!overnight;
  const days=overnight?Number(stayDays.value):1;
  const base=portalSettings.daily_price;
  const fee=overnight?Number(portalSettings.overnight_fee):0;
  requestSummary.innerHTML=`<div>السعر الأساسي: <b>${money(base)}</b></div>${overnight?`<div>رسوم المبيت: <b>${money(fee)}</b></div>`:''}<div>الإجمالي: <b>${base===null?'غير متوفر حاليًا':money(Number(base)+fee)}</b></div>${overnight?`<div>عدد الأيام: <b>${days}</b></div>`:''}`;
  lastAvailability=null;
}
async function checkAvailability(){
  if(!entryDate.value)return {available:false,message:'اختر تاريخ الدخول أولًا.'};
  const overnight=bookingType.value==='overnight';
  const days=overnight?Number(stayDays.value):1;
  if(overnight&&days<2)return {available:false,message:'حدد مدة مبيت يومين أو أكثر.'};
  const end=addDays(entryDate.value,Math.max(0,days-1));
  const {data,error}=await portalClient.rpc('get_resort_date_availability',{requested_start:entryDate.value,requested_end:end});
  if(error)return {available:false,message:'تعذر التحقق من التوفر الآن. يرجى المحاولة لاحقًا أو التواصل للاستفسار.',error};
  const changed=(data||[]).find(day=>day.availability!=='available');
  if(changed){
    return {available:false,message:changed.availability==='booked'?'أحد التواريخ المحددة أصبح محجوزًا. يرجى اختيار تاريخ آخر.':'أحد التواريخ المحددة غير متاح للحجز. يرجى اختيار تاريخ آخر.'};
  }
  return {available:true,message:'التواريخ المحددة متاحة حاليًا. التوفر لا يعني تأكيد الحجز.'};
}
async function refreshAvailability(){
  const result=await checkAvailability();
  lastAvailability=result;
  requestSummary.insertAdjacentHTML('beforeend',`<div><b>${escapeText(result.message)}</b></div>`);
  whatsappRequestButton.disabled=!portalSettings.booking_requests_open||!result.available;
  return result;
}
function buildWhatsAppMessage(){
  const overnight=bookingType.value==='overnight';
  const days=overnight?Number(stayDays.value):1;
  const exit=entryDate.value?addDays(entryDate.value,overnight?days:1):'';
  const base=portalSettings.daily_price;
  const fee=overnight?Number(portalSettings.overnight_fee):0;
  const total=base===null?'غير متوفر':money(Number(base)+fee);
  return `السلام عليكم،
أرغب في حجز منتجع أضواء الشرق.

تفاصيل الطلب:
- نوع الحجز: ${overnight?'مبيت':'يومي'}
- تاريخ الدخول: ${entryDate.value}
- تاريخ الخروج: ${exit}
- عدد الأيام: ${days}
- السعر الأساسي: ${money(base)}
- رسوم المبيت: ${overnight?money(fee):'لا توجد'}
- الإجمالي: ${total}

وقد ظهر لي أن التاريخ متاح وقت إرسال الطلب.

أرجو تزويدي بخطوات إكمال الحجز وتحويل العربون.

مع العلم أن الحجز لا يعتبر مؤكدًا إلا بعد موافقة الإدارة واستلام العربون.`;
}
bookingType.addEventListener('change',updateRequestSummary);
stayDays.addEventListener('input',updateRequestSummary);
entryDate.addEventListener('change',()=>{updateRequestSummary();refreshAvailability()});
bookingType.addEventListener('change',()=>{if(entryDate.value)refreshAvailability()});
stayDays.addEventListener('change',()=>{if(entryDate.value)refreshAvailability()});
bookingRequestForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!portalSettings.booking_requests_open)return;
  if(!entryDate.value){entryDate.focus();return}
  if(bookingType.value==='overnight'&&Number(stayDays.value)<2){stayDays.setCustomValidity('حدد مدة مبيت يومين أو أكثر.');stayDays.reportValidity();return}
  stayDays.setCustomValidity('');
  whatsappRequestButton.disabled=true;
  whatsappRequestButton.textContent='جاري إعادة التحقق...';
  const availability=await refreshAvailability();
  whatsappRequestButton.textContent='إرسال الطلب عبر واتساب';
  if(!availability.available)return;
  window.location.href=`https://wa.me/${portalSettings.whatsapp_number}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
});
entryDate.min=isoDate(new Date());
loadPortal();
