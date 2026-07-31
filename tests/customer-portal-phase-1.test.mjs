import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('لوحة إدارة بوابة العملاء تعرض أقسام الإدارة المعتمدة كوظائف فعلية',async()=>{
  const html=await read('index.html');
  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.match(html,/supabase-js@2[\s\S]*window\.supabase\.createClient\(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY/);
  assert.match(html,/window\.supabaseClient\s*=\s*supabaseClient/);
  assert.match(html,/window\.supabaseClient\s*=\s*supabaseClient[\s\S]*<script src="portal-admin\.js"><\/script>/);
  assert.match(html,/إدارة بوابة العملاء/);
  for(const id of [
    'portalResortName',
    'portalShortDescription',
    'portalDetailedDescription',
    'portalCheckinTime',
    'portalCheckoutTime',
    'portalMapsUrl',
    'portalWhatsappUrl',
    'portalInstagramUrl',
    'portalAddress',
    'portalCheckinInstructions',
    'portalFeatureInput',
    'portalRequestsOpen',
    'portalClosedMessage'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/حفظ معلومات المنتجع/);
  for(const id of [
    'portalImageUploadForm',
    'portalImageFile',
    'portalImagePreview',
    'portalImageCategory',
    'portalImageTitle',
    'portalImageDescription',
    'portalImageAlt',
    'portalImageIsCover',
    'portalImageIsVisible',
    'portalImagesList'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/رفع الصورة وحفظها/);
  for(const id of [
    'portalUnavailableForm',
    'portalUnavailableId',
    'portalUnavailableStart',
    'portalUnavailableEnd',
    'portalUnavailablePreview',
    'portalUnavailableList'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/حفظ الفترة/);
  for(const id of [
    'portalPricingForm',
    'portalWeekdayPrice',
    'portalWeekendPrice',
    'portalSeasonForm',
    'portalSeasonId',
    'portalSeasonName',
    'portalSeasonPrice',
    'portalSeasonStart',
    'portalSeasonEnd',
    'portalSeasonActive',
    'portalSeasonPreview',
    'portalSeasonsList'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/حفظ الأسعار الأساسية/);
  assert.match(html,/حفظ الموسم/);
  for(const id of [
    'portalContactForm',
    'portalContactWhatsapp',
    'portalContactMapsUrl',
    'portalContactInstagramUrl',
    'portalContactEmail',
    'portalContactHours'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/حفظ بيانات التواصل/);
});

test('الأقسام غير المطلوبة ما زالت مؤجلة دون حقول تشغيل',async()=>{
  const html=await read('index.html');
  for(const title of ['التواصل','معاينة البوابة']){
    assert.match(html,new RegExp(title));
  }
  assert.match(html,/resort\/preview\.html/);
  assert.doesNotMatch(html,/portalOvernightFee|portalBooking|portalReservation|portalContactMessage|sendPortalMessage/);
});

test('منطق لوحة البوابة مربوط بالإدارة المعتمدة فقط دون صفحة العملاء أو الحجز',async()=>{
  const js=await read('portal-admin.js');
  assert.match(js,/customer_portal_resort_info/);
  assert.match(js,/customer_portal_images/);
  assert.match(js,/customer_portal_unavailable_periods/);
  assert.match(js,/customer_portal_pricing/);
  assert.match(js,/customer_portal_seasons/);
  assert.match(js,/customer_portal_contact/);
  assert.match(js,/customer-portal-images/);
  assert.match(js,/loadPortalResortInfo/);
  assert.match(js,/savePortalResortInfo/);
  assert.match(js,/addPortalFeature/);
  assert.match(js,/uploadPortalImage/);
  assert.match(js,/resizePortalImage/);
  assert.match(js,/deletePortalImage/);
  assert.match(js,/loadPortalUnavailablePeriods/);
  assert.match(js,/savePortalUnavailablePeriod/);
  assert.match(js,/deletePortalUnavailablePeriod/);
  assert.match(js,/portalRangesOverlap/);
  assert.match(js,/savePortalPricing/);
  assert.match(js,/savePortalSeason/);
  assert.match(js,/deletePortalSeason/);
  assert.match(js,/savePortalContact/);
  assert.match(js,/loadPortalContact/);
  assert.doesNotMatch(js,/customer_portal_settings|get_resort_date_availability|portalOvernightFee|createBooking|confirmBooking|sendPortalMessage|portalContactMessage/);
});

test('Migration معلومات المنتجع ينشئ جدول معلومات المنتجع وRLS دون نطاقات مؤجلة',async()=>{
  const sql=await read('supabase/migrations/20260731090000_customer_portal_resort_info.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_resort_info/i);
  assert.match(sql,/features jsonb not null default '\[\]'::jsonb/i);
  assert.match(sql,/alter table public\.customer_portal_resort_info enable row level security/i);
  assert.match(sql,/to anon, authenticated[\s\S]*using \(id = 'main'\)/i);
  assert.match(sql,/public\.is_resort_admin\(\)/);
  assert.doesNotMatch(sql,/customer_portal_images|storage\.buckets|resort_bookings|resort_unavailable|daily_price|overnight_fee/i);
  assert.doesNotMatch(sql,/service_role/i);
});

test('Migration الصور ينشئ الجدول والـBucket وRLS وسياسات Storage',async()=>{
  const sql=await read('supabase/migrations/20260731093000_customer_portal_images.sql');
  assert.match(sql,/insert into storage\.buckets/i);
  assert.match(sql,/customer-portal-images/);
  assert.match(sql,/create table if not exists public\.customer_portal_images/i);
  for(const field of [
    'category text',
    'title text',
    'description text',
    'image_alt text',
    'image_url text',
    'display_order integer',
    'is_cover boolean',
    'is_visible boolean',
    'created_at timestamptz',
    'updated_at timestamptz',
    'updated_by uuid'
  ]) assert.match(sql,new RegExp(field,'i'));
  for(const category of ['general','green_area','pool','tent',"men''s_majlis",'indoor_hall','kitchen','double_bedroom','six_beds_room','extra_room','outdoor_session']){
    assert.match(sql,new RegExp(category.replace(/[']/g,"'"),'i'));
  }
  assert.match(sql,/alter table public\.customer_portal_images enable row level security/i);
  assert.match(sql,/public reads visible customer portal images/i);
  assert.match(sql,/admins insert customer portal images/i);
  assert.match(sql,/admins update customer portal images/i);
  assert.match(sql,/admins delete customer portal images/i);
  assert.match(sql,/customer_portal_images_single_cover_per_category_idx/i);
  assert.match(sql,/on public\.customer_portal_images \(category\)[\s\S]*where is_cover/i);
  assert.match(sql,/public\.is_resort_admin\(\)/);
  assert.match(sql,/on storage\.objects[\s\S]*for insert[\s\S]*bucket_id = 'customer-portal-images'/i);
  assert.doesNotMatch(sql,/resort_bookings|daily_price|overnight_fee|season_price|season_start|season_end/i);
  assert.doesNotMatch(sql,/service_role/i);
});

test('Migration تقوية الصور يمنع سرد ملفات Storage العام',async()=>{
  const sql=await read('supabase/migrations/20260731183000_harden_customer_portal_image_listing.sql');
  assert.match(sql,/drop policy if exists "public reads customer portal image files"/);
  assert.doesNotMatch(sql,/create policy/);
});

test('Migration التواريخ غير المتاحة ينشئ الجدول وRLS ويمنع التداخل',async()=>{
  const sql=await read('supabase/migrations/20260731100000_customer_portal_unavailable_periods.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_unavailable_periods/i);
  assert.match(sql,/start_date date not null/i);
  assert.match(sql,/end_date date not null/i);
  assert.match(sql,/exclude using gist/i);
  assert.match(sql,/daterange\(start_date, end_date, '\[\]'\) with &&/i);
  assert.match(sql,/alter table public\.customer_portal_unavailable_periods enable row level security/i);
  assert.match(sql,/to anon, authenticated[\s\S]*using \(true\)/i);
  assert.match(sql,/admins insert customer portal unavailable periods/i);
  assert.match(sql,/admins update customer portal unavailable periods/i);
  assert.match(sql,/admins delete customer portal unavailable periods/i);
  assert.match(sql,/public\.is_resort_admin\(\)/);
  assert.doesNotMatch(sql,/resort_bookings|daily_price|overnight_fee|season_price|customer_portal_prices/i);
  assert.doesNotMatch(sql,/service_role/i);
});

test('Migration الأسعار والمواسم ينشئ الجداول وRLS ويمنع تداخل المواسم',async()=>{
  const pricing=await read('supabase/migrations/20260731103000_customer_portal_pricing.sql');
  assert.match(pricing,/create table if not exists public\.customer_portal_pricing/i);
  assert.match(pricing,/weekday_price numeric\(10,2\)/i);
  assert.match(pricing,/weekend_price numeric\(10,2\)/i);
  assert.match(pricing,/alter table public\.customer_portal_pricing enable row level security/i);
  assert.match(pricing,/to anon, authenticated[\s\S]*using \(id = 'main'\)/i);
  assert.match(pricing,/public\.is_resort_admin\(\)/);
  assert.doesNotMatch(pricing,/resort_bookings|portal_booking|portal_reservation|service_role/i);

  const seasons=await read('supabase/migrations/20260731104000_customer_portal_seasons.sql');
  assert.match(seasons,/create table if not exists public\.customer_portal_seasons/i);
  assert.match(seasons,/season_name text not null/i);
  assert.match(seasons,/season_price numeric\(10,2\) not null/i);
  assert.match(seasons,/is_active boolean not null default true/i);
  assert.match(seasons,/exclude using gist/i);
  assert.match(seasons,/daterange\(start_date, end_date, '\[\]'\) with &&/i);
  assert.match(seasons,/alter table public\.customer_portal_seasons enable row level security/i);
  assert.match(seasons,/public reads active customer portal seasons/i);
  assert.match(seasons,/admins read all customer portal seasons/i);
  assert.match(seasons,/admins insert customer portal seasons/i);
  assert.match(seasons,/admins update customer portal seasons/i);
  assert.match(seasons,/admins delete customer portal seasons/i);
  assert.match(seasons,/public\.is_resort_admin\(\)/);
  assert.doesNotMatch(seasons,/resort_bookings|get_resort_date_availability|service_role/i);
});

test('Migration التواصل ينشئ الجدول وRLS دون نموذج رسائل',async()=>{
  const sql=await read('supabase/migrations/20260731105000_customer_portal_contact.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_contact/i);
  assert.match(sql,/whatsapp_number text not null/i);
  assert.match(sql,/maps_url text not null/i);
  assert.match(sql,/instagram_url text not null/i);
  assert.match(sql,/email text not null default ''/i);
  assert.match(sql,/contact_hours text not null default ''/i);
  assert.match(sql,/alter table public\.customer_portal_contact enable row level security/i);
  assert.match(sql,/to anon, authenticated[\s\S]*using \(id = 'main'\)/i);
  assert.match(sql,/admins insert customer portal contact/i);
  assert.match(sql,/admins update customer portal contact/i);
  assert.match(sql,/public\.is_resort_admin\(\)/);
  assert.doesNotMatch(sql,/contact_message|portal_message|customer_lead|booking_request|service_role/i);
});

test('صفحة معاينة البوابة تعرض البيانات المركزية للقراءة فقط',async()=>{
  const html=await read('resort/preview.html');
  const js=await read('resort/preview.js');
  const css=await read('resort/preview.css');
  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.match(html,/معاينة بوابة العملاء/);
  assert.match(html,/عرض فقط/);
  for(const id of [
    'previewResortName',
    'previewGallery',
    'previewWeekdayPrice',
    'previewWeekendPrice',
    'previewSeasons',
    'previewWhatsapp',
    'previewMaps',
    'previewInstagram',
    'previewContactHours'
  ]) assert.match(html,new RegExp(`id="${id}"`));
  for(const table of [
    'customer_portal_resort_info',
    'customer_portal_images',
    'customer_portal_pricing',
    'customer_portal_seasons',
    'customer_portal_contact'
  ]) assert.match(js,new RegExp(table));
  assert.doesNotMatch(html+js,/bookingRequestForm|whatsappRequestButton|wa\.me|sendPortalMessage|get_resort_date_availability|insert\(|upsert\(|update\(|delete\(/);
  assert.match(css,/Mobile|@media\(max-width:760px\)|grid-template-columns:1fr/);
});

test('تنسيق أقسام بوابة العملاء متجاوب للجوال',async()=>{
  const css=await read('portal-admin.css');
  assert.match(css,/portal-info-form/);
  assert.match(css,/portal-image-form/);
  assert.match(css,/portal-images-list/);
  assert.match(css,/portal-image-actions/);
  assert.match(css,/portal-unavailable-form/);
  assert.match(css,/portal-unavailable-list/);
  assert.match(css,/portal-pricing-form/);
  assert.match(css,/portal-season-form/);
  assert.match(css,/portal-seasons-list/);
  assert.match(css,/portal-contact-form/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/portal-feature-input-row/);
});

test('بوابة العملاء تعرض المعرض والتقويم والأسعار والتواصل وطلب واتساب دون حفظ حجز',async()=>{
  const html=await read('resort/index.html');
  const js=await read('resort/portal.js');
  const css=await read('resort/portal.css');

  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.match(html,/بوابة عملاء منتجع أضواء الشرق/);
  assert.match(html,/id="portalGallery"/);
  assert.match(html,/id="resortInformation"/);
  assert.match(html,/id="portalResortName"/);
  assert.match(html,/id="portalDetailedDescription"/);
  assert.match(html,/id="portalFeatures"/);
  assert.match(html,/id="clientCalendar"/);
  assert.match(html,/id="calendarGrid"/);
  assert.match(html,/id="selectedDayCard"/);
  assert.match(html,/id="clientContact"/);
  assert.match(html,/id="contactWhatsappNumber"/);
  assert.match(html,/id="contactWhatsappButton"/);
  assert.match(html,/id="contactMapsButton"/);
  assert.match(html,/id="contactInstagramButton"/);
  assert.match(html,/id="contactEmailRow"/);
  assert.match(html,/id="contactHours"/);
  assert.match(html,/id="imageLightbox"/);
  assert.match(html,/id="lightboxImage"/);

  assert.match(js,/customer_portal_images/);
  assert.match(js,/customer_portal_resort_info/);
  assert.match(js,/function loadResortInfo/);
  assert.match(js,/function renderResortInfo/);
  assert.match(js,/\.select\('id,category,title,description,image_alt,image_url,display_order,is_cover,is_visible,created_at'\)/);
  assert.match(js,/\.eq\('is_visible',true\)/);
  assert.match(js,/\.order\('category',\{ascending:true\}\)/);
  assert.match(js,/\.order\('is_cover',\{ascending:false\}\)/);
  assert.match(js,/function sortImages/);
  assert.match(js,/function groupImages/);
  assert.match(js,/function openLightbox/);
  assert.match(js,/CATEGORY_LABELS/);
  assert.match(js,/customer_portal_unavailable_periods/);
  assert.match(js,/\.select\('id,start_date,end_date'\)/);
  assert.match(js,/function isUnavailable/);
  assert.match(js,/function renderCalendar/);
  assert.match(js,/function formatHijri/);
  assert.match(js,/customer_portal_pricing/);
  assert.match(js,/\.select\('id,weekday_price,weekend_price'\)/);
  assert.match(js,/customer_portal_seasons/);
  assert.match(js,/\.select\('id,season_name,start_date,end_date,season_price,is_active'\)/);
  assert.match(js,/\.eq\('is_active',true\)/);
  assert.match(js,/function getDayPricing/);
  assert.match(js,/season\.season_price/);
  assert.match(js,/portalPricing\.weekend_price/);
  assert.match(js,/portalPricing\.weekday_price/);
  assert.match(js,/function isWeekend/);
  assert.match(js,/customer_portal_contact/);
  assert.match(js,/\.select\('id,whatsapp_number,maps_url,instagram_url,email,contact_hours'\)/);
  assert.match(js,/function createWhatsappUrl/);
  assert.match(js,/function createBookingRequestMessage/);
  assert.match(js,/function createBookingRequestUrl/);
  assert.match(js,/bookingRequestButton/);
  assert.match(js,/function renderContact/);
  assert.match(js,/أرغب في طلب حجز منتجع أضواء الشرق/);
  assert.match(js,/هذا الطلب غير مؤكد حتى موافقة الإدارة/);
  assert.match(js,/اسم المنتجع: منتجع أضواء الشرق/);
  assert.match(js,/أود الاستفسار عن منتجع أضواء الشرق/);
  assert.match(js,/contactWhatsappButton\.href/);
  assert.match(js,/contactMapsButton\.href/);
  assert.match(js,/متاح/);
  assert.match(js,/غير متاح/);

  for(const category of ['general','green_area','pool','tent',"men's_majlis",'indoor_hall','kitchen','double_bedroom','six_beds_room','extra_room','outdoor_session']){
    assert.match(js,new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }

  assert.match(css,/gallery-grid/);
  assert.match(css,/lightbox/);
  assert.match(css,/calendar-grid/);
  assert.match(css,/calendar-day/);
  assert.match(css,/calendar-day em/);
  assert.match(css,/calendar-day b/);
  assert.match(css,/calendar-day\.unavailable em/);
  assert.match(css,/contact-card/);
  assert.match(css,/contact-button/);
  assert.match(css,/booking-request-button/);
  assert.match(css,/booking-request-note/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(html+js,/bookingRequestForm|get_resort_date_availability|insert\(|upsert\(|update\(|delete\(|نموذج طلب|تأكيد الحجز|الدفع|payment/);
});
