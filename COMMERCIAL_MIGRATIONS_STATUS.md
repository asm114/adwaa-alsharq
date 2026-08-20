# Commercial Migrations Status — حالة الترحيلات التجارية

هذه المرحلة تخص `commercial-template` فقط، ولا تُطبق أي SQL على Production أو على أي مشروع Supabase حالي.

## ما تم

- فصل مسار تجاري جديد تحت `supabase/commercial` بدل استخدام تاريخ Staging مباشرة لعميل جديد.
- فصل **Migrations — الترحيلات** إلى Core للإدارة وPortal لبوابة العملاء.
- إنشاء Core foundation نظيف لـ`app_state` مع عضوية مدير تعتمد `auth.uid()` بدل بريد ثابت.
- إنشاء Portal admin foundation يعرّف `is_resort_admin()` من جدول عضوية خاص بالعميل.
- إنشاء معلومات المنشأة، الصور وStorage، التواريخ غير المتاحة، الأسعار، المواسم والتواصل بدون Seed خاص بأضواء الشرق أو أي عميل.
- عزل حقول `updated_by` عن anon في الجداول العامة التي يحتاجها Admin runtime باستخدام **Column Grants — صلاحيات الأعمدة**.
- إنشاء **Visitor Counter — عداد الزيارات** تجاري: صف صفري محايد، SHA-256 لمفتاح الزائر، ونافذة عد 24 ساعة بدون تخزين المفتاح الخام.
- إنشاء **Feedback — ملاحظات العملاء** عبر RPCs محددة مع Rate Limit، وحد أقصى 5 صور، وBucket خاص غير عام؛ لا توجد قراءة عامة للملاحظات أو ملفاتها.
- إنشاء **Activity Log — سجل النشاط** للمدير مع Trigger hardened موحد يسجل تغييرات Portal الإدارية بدون افتراض أعمدة غير موجودة.
- إصلاح صفحة الملاحظات التجارية بحيث تقرأ `ADWAA_PORTAL_SUPABASE_CONFIG` وNamespace العميل بدل Project Ref/Publishable Key لأضواء الشرق.
- إضافة اختبارات تمنع رجوع بريد/هوية/Project Refs الخاصة بأضواء الشرق إلى Final Features وتتحقق من توافق الصفحة وAdmin runtime.
- توثيق أن الملفات القديمة في `supabase/migrations` تبقى تاريخية ولا تُستخدم تلقائيًا لتركيب عميل.

## ما لم يتم بعد

- لم يُنقل بعد **Worker Checks — تشييك العامل** إلى المسار التجاري، بما في ذلك جدول التقارير وStorage/RLS والحذف.
- لم تُبن بعد **Provisioner — أداة التجهيز** التي تنشئ مستخدمي المدير وتربط UUID وتزرع هوية المنشأة وأسعارها ومواسمها وبيانات التواصل والعقد والأصول المسموح بها.
- لم تُجر **Fresh Install — تجربة تركيب من الصفر** على Supabase معزول.
- لم تُستخدم أي Service Role credentials ولم تُحفظ أي أسرار في GitHub.

## البوابة التالية

نقل Worker Checks إلى `supabase/commercial/portal/migrations` بصيغة Fresh Install محايدة، ومراجعة سياسات Storage/RLS والحذف مع runtime الحالي. بعد اكتمال Portal schema نبني Provisioner ثم نجرب أول تركيب كامل على Backend معزول قبل إنشاء نسخة العميل التجريبي.
