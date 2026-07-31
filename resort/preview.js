const SUPABASE_URL='https://ztqqdjryvecscidxxbfe.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_M3MQwFfxiMMKt_-tq-KAjQ_OQTtg2MD';
const previewClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

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
  previewStatus.textContent=message;
  previewStatus.className=`status ${type}`;
}
function formatDate(value){
  if(!value)return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'medium'}).format(new Date(`${value}T12:00:00`));
}
function renderFeatures(features){
  const list=Array.isArray(features)?features.filter(Boolean):[];
  previewFeatures.innerHTML=list.length?list.map(item=>`<div>${escapeText(item)}</div>`).join(''):'<div class="empty">لا توجد مميزات محفوظة.</div>';
}
function renderGallery(images){
  const visible=Array.isArray(images)?images:[];
  if(!visible.length){
    previewGallery.innerHTML='<div class="empty">لا توجد صور ظاهرة حاليًا.</div>';
    previewCoverImage.hidden=true;
    return;
  }
  const cover=visible.find(image=>image.is_cover)||visible[0];
  previewCoverImage.src=cover.image_url;
  previewCoverImage.alt=cover.image_alt||cover.title||'صورة منتجع أضواء الشرق';
  previewCoverImage.hidden=false;
  previewGallery.innerHTML=visible.map(image=>`
    <figure>
      <img src="${escapeText(image.image_url)}" alt="${escapeText(image.image_alt||image.title||'صورة من منتجع أضواء الشرق')}" loading="lazy">
      <figcaption>${escapeText(image.title||image.description||image.category||'صورة من المنتجع')}</figcaption>
    </figure>
  `).join('');
}
function renderSeasons(seasons){
  const active=Array.isArray(seasons)?seasons:[];
  previewSeasons.innerHTML=active.length?active.map(season=>`
    <article>
      <span>${escapeText(formatDate(season.start_date))} إلى ${escapeText(formatDate(season.end_date))}</span>
      <b>${escapeText(season.season_name)} — ${money(season.season_price)}</b>
    </article>
  `).join(''):'<div class="empty">لا توجد مواسم مفعلة حاليًا.</div>';
}
async function loadPreview(){
  setStatus('جاري تحميل بيانات المعاينة...');
  const [infoRes,imagesRes,pricingRes,seasonsRes,contactRes]=await Promise.all([
    previewClient.from('customer_portal_resort_info').select('*').eq('id','main').maybeSingle(),
    previewClient.from('customer_portal_images').select('*').eq('is_visible',true).order('display_order').order('created_at'),
    previewClient.from('customer_portal_pricing').select('*').eq('id','main').maybeSingle(),
    previewClient.from('customer_portal_seasons').select('*').eq('is_active',true).order('start_date'),
    previewClient.from('customer_portal_contact').select('*').eq('id','main').maybeSingle()
  ]);
  const info=infoRes.data||{};
  setText('previewResortName',info.resort_name,'أضواء الشرق');
  setText('previewShortDescription',info.short_description,'منتجع واسع في القاع البارد');
  setText('previewHeroTitle',info.short_description,'منتجع واسع في القاع البارد لجلساتكم ومناسباتكم الخاصة');
  setText('previewDetailedDescription',info.detailed_description,'لا يوجد وصف محفوظ بعد.');
  setText('previewCheckin',info.checkin_time);
  setText('previewCheckout',info.checkout_time);
  setText('previewAddress',info.resort_address);
  renderFeatures(info.features);
  renderGallery(imagesRes.data||[]);
  setText('previewWeekdayPrice',pricingRes.data?money(pricingRes.data.weekday_price):'غير محدد');
  setText('previewWeekendPrice',pricingRes.data?money(pricingRes.data.weekend_price):'غير محدد');
  renderSeasons(seasonsRes.data||[]);
  const contact=contactRes.data||{};
  setText('previewWhatsapp',contact.whatsapp_number);
  setText('previewMaps',contact.maps_url);
  setText('previewInstagram',contact.instagram_url);
  setText('previewEmail',contact.email||'غير محدد');
  setText('previewContactHours',contact.contact_hours);
  const errors=[infoRes,imagesRes,pricingRes,seasonsRes,contactRes].filter(result=>result.error);
  if(errors.length){
    console.error(errors.map(result=>result.error));
    setStatus('تم تحميل المعاينة مع تعذر بعض البيانات. تأكد من تطبيق Migrations على البيئة المعتمدة.','error');
  }else{
    setStatus('تم تحميل المعاينة من Supabase بنجاح.','success');
  }
}
loadPreview();
