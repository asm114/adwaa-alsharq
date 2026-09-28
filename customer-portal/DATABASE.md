# قاعدة بيانات بوابة العملاء

Project Ref الرسمي: `ztqqdjryvecscidxxbfe`

## الجداول المعتمدة

- `customer_portal_resort_info`
- `customer_portal_images`
- `customer_portal_unavailable_periods`
- `customer_portal_pricing`
- `customer_portal_seasons`
- `customer_portal_contact`
- `customer_portal_feedback`
- `customer_portal_visitor_counter`
- `customer_portal_activity_log`
- `customer_portal_admins`

## الجداول غير التابعة

تم فصل مشروع البوابة عن النظام الأساسي. لا تعتمد البوابة على:

- `app_state`
- `resort_bookings`
- `resort_prices`
- `resort_feedback`
- `resort_media_submissions`
- `resort_site_settings`
- `resort_unavailable_dates`
- `resort_unavailable_periods`
- `resort_activity_log`
- `resort_admins`

## RLS

القراءة العامة محصورة في بيانات العرض المسموحة. الإدارة تتم عبر `is_resort_admin()` التي تقرأ من `customer_portal_admins`.

لا تستخدم الواجهة أي مفتاح `service_role`.
