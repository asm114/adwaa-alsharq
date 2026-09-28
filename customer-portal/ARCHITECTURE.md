# قرار فصل بوابة العملاء

بوابة العملاء أصبحت مشروعًا مستقلًا عن نظام إدارة الحجوزات.

## ما تعنيه الاستقلالية

- البوابة لا تقرأ بيانات الحجوزات.
- البوابة لا تعدل بيانات العملاء.
- البوابة لا تعتمد على `app_state`.
- البوابة لا تعتمد على `resort_bookings`.
- طلب الحجز عبر واتساب لا ينشئ حجزًا في قاعدة البيانات.
- التواريخ غير المتاحة تدار يدويًا في جداول البوابة المستقلة.

## أثر التعطيل

يمكن تعطيل أو حذف بوابة العملاء دون تعطيل نظام الإدارة الأساسي، لأن كل ملفات
الواجهة والجداول والمرفقات الخاصة بها منفصلة.

## الجداول المسموحة

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

أي جدول حجوزات أو عملاء إداري خارج هذه القائمة ليس جزءًا من هذا المشروع.

## Production Supabase

`ztqqdjryvecscidxxbfe` هو Production الرسمي لبوابة العملاء فقط.
`pgdvlklpyrvmwzitsmbw` يبقى خاصًا بنظام الإدارة الأساسي.

لا يوجد اعتماد بين المشروعين على مستوى قاعدة البيانات. صلاحيات إدارة بوابة العملاء مخزنة في `customer_portal_admins`، والدالة `is_resort_admin()` باقية بالاسم نفسه لتجنب كسر سياسات RLS القديمة.
