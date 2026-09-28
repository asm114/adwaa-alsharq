# Decisions

## 2026-08-01

- اعتماد `ztqqdjryvecscidxxbfe` كـProduction الرسمي والمخصص لبوابة العملاء.
- إبقاء النظام الأساسي على `pgdvlklpyrvmwzitsmbw`.
- فصل صلاحيات إدارة البوابة في جدول `customer_portal_admins`.
- إبقاء اسم الدالة `is_resort_admin()` لتوافق RLS، مع تغيير مصدرها إلى `customer_portal_admins`.
- تنظيف مكونات النظام الأساسي القديمة من مشروع بوابة العملاء بعد نجاح النسخة الاحتياطية والاختبارات.
