# Current State

- بوابة العملاء مستقلة عن نظام الإدارة الأساسي.
- Supabase Production للبوابة: `ztqqdjryvecscidxxbfe`.
- Supabase Production للنظام الأساسي: `pgdvlklpyrvmwzitsmbw`.
- تم تطبيق Migration لفصل صلاحيات الإدارة إلى `customer_portal_admins` وتنظيف مكونات النظام الأساسي القديمة من مشروع البوابة.
- تم حفظ نسخة أمان محلية قبل التنظيف في `backups/`.
- لا يحتوي schema `public` الآن إلا على جداول بوابة العملاء و`customer_portal_admins`.
