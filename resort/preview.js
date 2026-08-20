function escapeText(value){
  const node=document.createElement('span');
  node.textContent=String(value??'');
  return node.innerHTML;
}
function money(value){
  return value===null||value===undefined||value===''?'غير محدد':`${Number(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ريال`;
}
function setText(id,value,fallback='—'){
  const el=document.getElementById(id);
  if(el)el.textContent=value||fallback;
}
function setStatus(message,type=''){
  const el=document.getElementById('previewStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`status ${type}`;
}
function renderFeatures(features){
  const list=Array.isArray(features)?features.filter(Boolean):[];
  const el=document.getElementById('previewFeatures');
  if(!el)return;
  el.innerHTML=list.length?list.map(item=>`<div>${escapeText(item)}</div>`).join(''):'<div class="empty">لا توجد مميزات تجريبية.</div>';
}
function renderGallery(images){
  const visible=Array.isArray(images)?images:[];
  const gallery=document.getElementById('previewGallery');
  const cover=document.getElementById('previewCoverImage');
  if(!gallery||!cover)return;
  if(!visible.length){
    gallery.innerHTML='<div class="empty">معرض الصور التجريبي غير مضاف في هذه النسخة.</div>';
    cover.hidden=true;
    return;
  }
  const coverImage=visible.find(image=>image.is_cover)||visible[0];
  cover.src=coverImage.image_url;
  cover.alt=coverImage.image_alt||coverImage.title||'صورة تجريبية';
  cover.hidden=false;
  gallery.innerHTML=visible.map(image=>`
    <figure>
      <img src="${escapeText(image.image_url)}" alt="${escapeText(image.image_alt||image.title||'صورة تجريبية')}" loading="lazy">
      <figcaption>${escapeText(image.title||image.description||image.category||'صورة تجريبية')}</figcaption>
    </figure>
  `).join('');
}
function renderSeasons(seasons){
  const active=Array.isArray(seasons)?seasons:[];
  const el=document.getElementById('previewSeasons');
  if(!el)return;
  el.innerHTML=active.length?active.map(season=>`
    <article>
      <span>${escapeText(season.period||'فترة تجريبية')}</span>
      <b>${escapeText(season.season_name)} — ${money(season.season_price)}</b>
    </article>
  `).join(''):'<div class="empty">لا توجد مواسم تجريبية مفعلة حاليًا.</div>';
}

const DEMO_PREVIEW={
  info:{
    resort_name:'العرض التجريبي',
    short_description:'تجربة بوابة العميل ببيانات وهمية فقط',
    detailed_description:'هذه معاينة لواجهة العميل قبل الحجز. جميع المعلومات المعروضة تجريبية ولا تمثل منشأة حقيقية.',
    checkin_time:'4:00 م',
    checkout_time:'2:00 ص',
    resort_address:'موقع تجريبي — بيانات غير حقيقية',
    features:['جلسة خارجية','مجلس داخلي','مطبخ مجهز','منطقة ألعاب']
  },
  images:[],
  pricing:{weekday_price:700,weekend_price:900},
  seasons:[{season_name:'موسم تجريبي',season_price:1100,period:'فترة تجريبية'}],
  contact:{
    whatsapp_number:'معطل في النسخة التجريبية',
    maps_url:'معطل في النسخة التجريبية',
    instagram_url:'معطل في النسخة التجريبية',
    email:'غير مستخدم في العرض',
    contact_hours:'بيانات تجريبية فقط'
  }
};

function loadPreview(){
  setStatus('جاري تجهيز بيانات العرض المحلية...');
  const {info,images,pricing,seasons,contact}=DEMO_PREVIEW;
  setText('previewResortName',info.resort_name,'العرض التجريبي');
  setText('previewShortDescription',info.short_description,'بيانات تجريبية');
  setText('previewHeroTitle','تجربة مبسطة لواجهة العميل قبل الحجز');
  setText('previewDetailedDescription',info.detailed_description);
  setText('previewCheckin',info.checkin_time);
  setText('previewCheckout',info.checkout_time);
  setText('previewAddress',info.resort_address);
  renderFeatures(info.features);
  renderGallery(images);
  setText('previewWeekdayPrice',money(pricing.weekday_price));
  setText('previewWeekendPrice',money(pricing.weekend_price));
  renderSeasons(seasons);
  setText('previewWhatsapp',contact.whatsapp_number);
  setText('previewMaps',contact.maps_url);
  setText('previewInstagram',contact.instagram_url);
  setText('previewEmail',contact.email);
  setText('previewContactHours',contact.contact_hours);
  setStatus('تم تحميل بيانات العرض المحلية بنجاح.','success');
}

loadPreview();
