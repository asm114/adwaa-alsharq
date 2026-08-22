const SUPABASE_URL='https://ztqqdjryvecscidxxbfe.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const portalClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let unavailablePeriods=[];
let portalPricing=null;
let activeSeasons=[];
let portalContact=null;
let portalResortInfo=null;
let selectedDateIso=null;
let galleryImages=[];
let lightboxImageIndex=-1;
let lightboxTouchStartX=null;
let calendarCursor=startOfMonth(new Date());

function customerPortalVisitorKey(){
  const storageKey='adwaa_portal_visitor_key';
  let value=localStorage.getItem(storageKey);
  if(!value){
    value=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}-${Math.random()}`;
    localStorage.setItem(storageKey,value);
  }
  return value;
}

async function countCustomerPortalVisit(){
  const {error}=await portalClient.rpc('increment_customer_portal_visitor',{p_visitor_key:customerPortalVisitorKey()});
  if(error)console.warn('تعذر تسجيل زيارة البوابة.',error.message);
}

const CATEGORY_LABELS={
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

function escapeText(value){
  const node=document.createElement('span');
  node.textContent=String(value??'');
  return node.innerHTML;
}

function setConnectionStatus(message,type=''){
  portalConnectionStatus.textContent=message;
  portalConnectionStatus.className=`wrap portal-status ${type}`;
}

function toIsoDate(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date){
  return new Date(date.getFullYear(),date.getMonth(),1);
}

function addMonths(date,months){
  return new Date(date.getFullYear(),date.getMonth()+months,1);
}

function formatGregorian(iso){
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(new Date(`${iso}T12:00:00`));
}

function formatHijri(iso){
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{year:'numeric',month:'long',day:'numeric'}).format(new Date(`${iso}T12:00:00`));
}

function isUnavailable(iso){
  return unavailablePeriods.some(period=>iso>=period.start_date&&iso<=period.end_date);
}

function isWeekend(date){
  return date.getDay()===5||date.getDay()===6;
}

function formatMoney(value){
  const number=Number(value);
  if(!Number.isFinite(number)||number<=0)return 'السعر غير محدد';
  return `${number.toLocaleString('ar-SA',{maximumFractionDigits:2})} ريال`;
}

function hasPublicPrice(value){
  const number=Number(value);
  return Number.isFinite(number)&&number>0;
}

function createWhatsappUrl(number,message){
  const digits=String(number||'').replace(/\D/g,'');
  if(!digits)return '#';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function createBookingRequestMessage(iso,pricing){
  const lines=[
    'السلام عليكم،',
    'أرغب في طلب حجز منتجع أضواء الشرق.',
    '',
    'تفاصيل الطلب:',
    '- اسم المنتجع: منتجع أضواء الشرق',
    `- التاريخ الميلادي: ${formatGregorian(iso)}`,
    `- التاريخ الهجري: ${formatHijri(iso)}`
  ];
  if(pricing&&hasPublicPrice(pricing.price))lines.push(`- السعر: ${formatMoney(pricing.price)}`);
  if(pricing?.seasonName)lines.push(`- الموسم: ${pricing.seasonName}`);
  lines.push(
    '',
    'أفهم أن هذا الطلب غير مؤكد حتى موافقة الإدارة، ولا يعتبر حجزًا مؤكدًا.',
    'أرجو تزويدي بخطوات إكمال الطلب.'
  );
  return lines.join('\n');
}

function createBookingRequestUrl(iso,pricing){
  if(isUnavailable(iso))return '#';
  return createWhatsappUrl(portalContact?.whatsapp_number,createBookingRequestMessage(iso,pricing));
}

function getDayPricing(iso,date){
  const season=activeSeasons.find(item=>iso>=item.start_date&&iso<=item.end_date);
  if(season)return {price:season.season_price,seasonName:season.season_name};
  if(!portalPricing)return {price:null,seasonName:''};
  return {
    price:isWeekend(date)?portalPricing.weekend_price:portalPricing.weekday_price,
    seasonName:''
  };
}

function sortImages(images){
  return [...images].sort((a,b)=>{
    if(Boolean(a.is_cover)!==Boolean(b.is_cover))return a.is_cover?-1:1;
    return (Number(a.display_order)||0)-(Number(b.display_order)||0)||String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
}

function groupImages(images){
  return images.reduce((groups,image)=>{
    const category=image.category||'general';
    if(!groups.has(category))groups.set(category,[]);
    groups.get(category).push(image);
    return groups;
  },new Map());
}

function updateLightboxImage(){
  const image=galleryImages[lightboxImageIndex];
  if(!image)return;
  lightboxImage.src=image.image_url;
  lightboxImage.alt=image.image_alt||image.title||'صورة من منتجع أضواء الشرق';
  lightboxCaption.textContent=image.title||image.description||CATEGORY_LABELS[image.category]||'صورة من منتجع أضواء الشرق';
}

function openLightbox(image){
  lightboxImageIndex=galleryImages.findIndex(item=>item.id===image.id);
  updateLightboxImage();
  imageLightbox.hidden=false;
  document.body.classList.add('lightbox-open');
  lightboxClose.focus();
}

function closeLightbox(){
  imageLightbox.hidden=true;
  lightboxImage.removeAttribute('src');
  lightboxImageIndex=-1;
  document.body.classList.remove('lightbox-open');
}

function moveLightbox(direction){
  if(!galleryImages.length)return;
  lightboxImageIndex=(lightboxImageIndex+direction+galleryImages.length)%galleryImages.length;
  updateLightboxImage();
}

function renderGallery(images){
  galleryImages=sortImages(images);
  if(!images.length){
    heroCoverImage.hidden=true;
    portalGallery.innerHTML='<div class="empty">لا توجد صور ظاهرة حاليًا.</div>';
    return;
  }
  const cover=images.find(image=>image.is_cover)||galleryImages[0];
  heroCoverImage.src=cover.image_url;
  heroCoverImage.alt=cover.image_alt||cover.title||'منظر من منتجع أضواء الشرق';
  heroCoverImage.hidden=false;
  const groups=groupImages(images);
  portalGallery.innerHTML=[...groups.entries()].map(([category,items])=>{
    const sorted=sortImages(items);
    return `
      <section class="gallery-group">
        <div class="gallery-group-head">
          <h3>${escapeText(CATEGORY_LABELS[category]||category)}</h3>
          <span>${sorted.length.toLocaleString('ar-SA')} صورة</span>
        </div>
        <div class="gallery-grid">
          ${sorted.map(image=>`
            <button class="gallery-tile ${image.is_cover?'cover':''}" type="button" data-image-id="${escapeText(image.id)}">
              <img src="${escapeText(image.image_url)}" alt="${escapeText(image.image_alt||image.title||'صورة من منتجع أضواء الشرق')}" loading="lazy">
              <span>${escapeText(image.title||image.description||'صورة من المنتجع')}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');
  portalGallery.querySelectorAll('[data-image-id]').forEach(button=>{
    button.addEventListener('click',()=>{
      const image=images.find(item=>item.id===button.dataset.imageId);
      if(image)openLightbox(image);
    });
  });
}

function renderSelectedDay(iso,unavailable){
  selectedDateIso=unavailable?null:iso;
  const date=new Date(`${iso}T12:00:00`);
  const pricing=unavailable?null:getDayPricing(iso,date);
  const canRequest=!unavailable&&portalContact?.whatsapp_number;
  selectedDayCard.innerHTML=`
    <strong>${unavailable?'غير متاح':'متاح'}</strong>
    <span>الميلادي: ${escapeText(formatGregorian(iso))}</span>
    <span>الهجري: ${escapeText(formatHijri(iso))}</span>
    ${!unavailable&&pricing&&hasPublicPrice(pricing.price)?`<span>السعر: ${escapeText(formatMoney(pricing.price))}</span>`:''}
    ${!unavailable&&pricing?.seasonName?`<span>الموسم: ${escapeText(pricing.seasonName)}</span>`:''}
    ${canRequest?`<a id="bookingRequestButton" class="booking-request-button" href="${escapeText(createBookingRequestUrl(iso,pricing))}" target="_blank" rel="noopener">طلب الحجز</a>`:''}
    ${!unavailable&&!canRequest?'<span class="booking-request-disabled">لا يمكن إنشاء رابط الطلب حتى تتوفر بيانات واتساب.</span>':''}
    ${!unavailable?'<small class="booking-request-note">طلب الحجز عبر واتساب غير مؤكد حتى موافقة الإدارة.</small>':''}
  `;
  selectedDayCard.className=`selected-day-card ${unavailable?'unavailable':'available'}`;
}

function clearSelectedDay(){
  selectedDateIso=null;
  selectedDayCard.textContent='اختر يومًا متاحًا لعرض حالته.';
  selectedDayCard.className='selected-day-card';
}

function renderCalendar(){
  const monthStart=startOfMonth(calendarCursor);
  const monthEnd=new Date(monthStart.getFullYear(),monthStart.getMonth()+1,0);
  const leadingDays=monthStart.getDay();
  const totalCells=Math.ceil((leadingDays+monthEnd.getDate())/7)*7;
  calendarMonthLabel.textContent=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{year:'numeric',month:'long'}).format(monthStart);
  calendarGrid.innerHTML=Array.from({length:totalCells},(_,index)=>{
    const dayNumber=index-leadingDays+1;
    if(dayNumber<1||dayNumber>monthEnd.getDate())return '<span class="calendar-empty" aria-hidden="true"></span>';
    const date=new Date(monthStart.getFullYear(),monthStart.getMonth(),dayNumber);
    const iso=toIsoDate(date);
    const unavailable=isUnavailable(iso);
    const pricing=unavailable?null:getDayPricing(iso,date);
    const hijri=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'short'}).format(date);
    return `
      <button class="calendar-day ${unavailable?'unavailable':'available'}" type="button" data-date="${iso}" ${unavailable?'disabled':''} aria-label="${escapeText(`${formatGregorian(iso)}، ${unavailable?'غير متاح':'متاح'}`)}">
        <strong>${dayNumber.toLocaleString('ar-SA')}</strong>
        <small>${escapeText(hijri)}</small>
        <span>${unavailable?'غير متاح':'متاح'}</span>
        ${pricing?`<em>${escapeText(formatMoney(pricing.price))}</em>`:''}
        ${pricing?.seasonName?`<b>${escapeText(pricing.seasonName)}</b>`:''}
      </button>
    `;
  }).join('');
  calendarGrid.querySelectorAll('.calendar-day.available').forEach(button=>{
    button.addEventListener('click',()=>{
      calendarGrid.querySelectorAll('.calendar-day.selected').forEach(day=>day.classList.remove('selected'));
      button.classList.add('selected');
      renderSelectedDay(button.dataset.date,false);
    });
  });
}

function renderContact(){
  if(!portalContact){
    contactStatus.textContent='تعذر تحميل بيانات التواصل الآن.';
    contactStatus.className='contact-status error';
    return;
  }
  const inquiryMessage='السلام عليكم، أود الاستفسار عن منتجع أضواء الشرق.';
  contactWhatsappNumber.textContent=portalContact.whatsapp_number||'غير متوفر';
  contactHours.textContent=portalContact.contact_hours||'غير محدد';
  contactWhatsappButton.href=createWhatsappUrl(portalContact.whatsapp_number,inquiryMessage);
  heroWhatsappButton.href=contactWhatsappButton.href;
  headerWhatsappButton.href=contactWhatsappButton.href;
  floatingWhatsappButton.href=contactWhatsappButton.href;
  contactMapsButton.href=portalContact.maps_url||'#';
  if(portalContact.instagram_url){
    contactInstagramButton.href=portalContact.instagram_url;
    contactInstagramButton.hidden=false;
  }else{
    contactInstagramButton.hidden=true;
  }
  if(portalContact.email){
    contactEmail.href=`mailto:${portalContact.email}`;
    contactEmail.textContent=portalContact.email;
    contactEmailRow.hidden=false;
  }else{
    contactEmailRow.hidden=true;
  }
  contactStatus.textContent='بيانات التواصل محملة من Supabase.';
  contactStatus.className='contact-status success';
}

function renderResortInfo(){
  if(!portalResortInfo){
    portalDetailedDescription.textContent='تعذر تحميل معلومات المنتجع الآن.';
    portalFeatures.innerHTML='';
    return;
  }
  portalResortName.textContent=portalResortInfo.resort_name||'منتجع أضواء الشرق';
  portalShortDescription.textContent=portalResortInfo.short_description||'';
  portalDetailedDescription.textContent=portalResortInfo.detailed_description||'';
  portalResortAddress.textContent=portalResortInfo.resort_address||'غير محدد';
  portalCheckinTime.textContent=portalResortInfo.checkin_time||'غير محدد';
  portalCheckoutTime.textContent=portalResortInfo.checkout_time||'غير محدد';
  heroAddress.textContent=portalResortInfo.resort_address||'القاع البارد';
  heroCheckin.textContent=portalResortInfo.checkin_time||'غير محدد';
  heroCheckout.textContent=portalResortInfo.checkout_time||'غير محدد';
  const features=Array.isArray(portalResortInfo.features)?portalResortInfo.features:[];
  portalFeatures.innerHTML=features.map(item=>`<li>${escapeText(item)}</li>`).join('');
}

function renderPricingOverview(){
  weekdayPrice.textContent=portalPricing?formatMoney(portalPricing.weekday_price):'غير محدد';
  weekendPrice.textContent=portalPricing?formatMoney(portalPricing.weekend_price):'غير محدد';
  activeSeasonsCount.textContent=activeSeasons.length?`${activeSeasons.length.toLocaleString('ar-SA')} موسم`:'لا توجد مواسم فعالة';
  activeSeasonsSummary.textContent=activeSeasons.length
    ?activeSeasons.map(season=>season.season_name).join('، ')
    :'يُطبّق السعر الأساسي حسب اليوم';
}

async function loadResortInfo(){
  const {data,error}=await portalClient
    .from('customer_portal_resort_info')
    .select('id,resort_name,short_description,detailed_description,checkin_time,checkout_time,resort_address,features')
    .eq('id','main')
    .maybeSingle();
  if(error){
    console.error(error);
    portalResortInfo=null;
    renderResortInfo();
    return false;
  }
  portalResortInfo=data||null;
  renderResortInfo();
  return Boolean(portalResortInfo);
}

async function loadGallery(){
  setConnectionStatus('جاري تحميل الصور من Supabase...');
  const {data,error}=await portalClient
    .from('customer_portal_images')
    .select('id,category,title,description,image_alt,image_url,display_order,is_cover,is_visible,created_at')
    .eq('is_visible',true)
    .order('category',{ascending:true})
    .order('is_cover',{ascending:false})
    .order('display_order',{ascending:true})
    .order('created_at',{ascending:true});
  if(error){
    console.error(error);
    portalGallery.innerHTML='<div class="empty">تعذر تحميل الصور الآن.</div>';
    return false;
  }
  renderGallery(data||[]);
  return true;
}

async function loadUnavailablePeriods(){
  const {data,error}=await portalClient
    .from('customer_portal_unavailable_periods_public')
    .select('start_date,end_date')
    .order('start_date',{ascending:true});
  if(error){
    console.error(error);
    unavailablePeriods=[];
    selectedDayCard.textContent='تعذر تحميل التواريخ غير المتاحة الآن.';
    selectedDayCard.className='selected-day-card unavailable';
    return false;
  }
  unavailablePeriods=data||[];
  renderCalendar();
  return true;
}

async function loadPricing(){
  const {data,error}=await portalClient
    .from('customer_portal_pricing')
    .select('id,weekday_price,weekend_price')
    .eq('id','main')
    .maybeSingle();
  if(error){
    console.error(error);
    portalPricing=null;
    return false;
  }
  portalPricing=data||null;
  renderPricingOverview();
  return true;
}

async function loadActiveSeasons(){
  const {data,error}=await portalClient
    .from('customer_portal_seasons')
    .select('id,season_name,start_date,end_date,season_price,is_active')
    .eq('is_active',true)
    .order('start_date',{ascending:true});
  if(error){
    console.error(error);
    activeSeasons=[];
    return false;
  }
  activeSeasons=data||[];
  renderPricingOverview();
  return true;
}

async function loadContact(){
  const {data,error}=await portalClient
    .from('customer_portal_contact')
    .select('id,whatsapp_number,maps_url,instagram_url,email,contact_hours')
    .eq('id','main')
    .maybeSingle();
  if(error){
    console.error(error);
    portalContact=null;
    renderContact();
    return false;
  }
  portalContact=data||null;
  renderContact();
  if(selectedDateIso)renderSelectedDay(selectedDateIso,false);
  return Boolean(portalContact);
}

async function loadPortal(){
  setConnectionStatus('جاري تحميل بيانات البوابة من Supabase...');
  const [resortInfoLoaded,galleryLoaded,calendarLoaded,pricingLoaded,seasonsLoaded,contactLoaded]=await Promise.all([
    loadResortInfo(),
    loadGallery(),
    loadUnavailablePeriods(),
    loadPricing(),
    loadActiveSeasons(),
    loadContact()
  ]);
  renderCalendar();
  renderPricingOverview();
  if(resortInfoLoaded&&galleryLoaded&&calendarLoaded&&pricingLoaded&&seasonsLoaded&&contactLoaded)setConnectionStatus('تم تحميل بيانات البوابة من Supabase.','success');
  else setConnectionStatus('تعذر تحميل بعض بيانات البوابة من Supabase.','error');
}

lightboxClose.addEventListener('click',closeLightbox);
lightboxPrevious.addEventListener('click',()=>moveLightbox(-1));
lightboxNext.addEventListener('click',()=>moveLightbox(1));
imageLightbox.addEventListener('click',event=>{if(event.target===imageLightbox)closeLightbox()});
imageLightbox.addEventListener('touchstart',event=>{lightboxTouchStartX=event.changedTouches[0]?.clientX??null},{passive:true});
imageLightbox.addEventListener('touchend',event=>{
  if(lightboxTouchStartX===null)return;
  const distance=(event.changedTouches[0]?.clientX??lightboxTouchStartX)-lightboxTouchStartX;
  if(Math.abs(distance)>50)moveLightbox(distance>0?-1:1);
  lightboxTouchStartX=null;
},{passive:true});
document.addEventListener('keydown',event=>{
  if(imageLightbox.hidden)return;
  if(event.key==='Escape')closeLightbox();
  if(event.key==='ArrowRight')moveLightbox(-1);
  if(event.key==='ArrowLeft')moveLightbox(1);
});
prevMonthButton.addEventListener('click',()=>{
  calendarCursor=addMonths(calendarCursor,-1);
  renderCalendar();
  clearSelectedDay();
});
nextMonthButton.addEventListener('click',()=>{
  calendarCursor=addMonths(calendarCursor,1);
  renderCalendar();
  clearSelectedDay();
});
countCustomerPortalVisit();
loadPortal();
