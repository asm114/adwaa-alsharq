# إعداد Supabase Staging — أضواء الشرق

هذه الخطوات لبيئة اختبار مستقلة فقط. لا تستخدم مشروع الإنتاج ولا تنسخ بيانات
عملاء حقيقية.

## 1. إنشاء المشروع

1. من Supabase أنشئ مشروعًا جديدًا باسم واضح مثل `Adwaa Al Sharq Staging`.
2. استخدم كلمة مرور قاعدة مختلفة عن الإنتاج واحفظها في مدير أسرار موثوق.
3. لا تربط نطاق الإنتاج أو GitHub Pages بالمشروع التجريبي.
4. سجّل Project Ref فقط في تقرير الاختبار بعد إخفاء جزء منه.

## 2. إنشاء المستخدمين التجريبيين

أنشئ مستخدمين مصطنعين في Auth:

- مدير تجريبي سيملك صف `app_state/main`.
- مستخدم مصادق آخر لا يملك الصف.

لا تستخدم بريد المدير الحقيقي أو أي بيانات عميل.

## 3. الإعداد المحلي

1. انسخ `staging-config.example.js` إلى `staging-config.js`.
2. ضع URL وPublishable Key الخاصين بـStaging فقط.
3. لا تضع `service_role` أو Database password أو JWT مستخدم داخل الملف.
4. `staging-config.js` و`.env*` وملفات `*.dump` مستثناة في `.gitignore`.
5. تحقق بـ`git status` أن أي ملف أسرار لا يظهر ضمن الملفات المراد رفعها.

## 4. البيانات المصطنعة

أنشئ جدول `app_state` بالشكل نفسه المستخدم في المشروع، ثم صفًا واحدًا `main`
يحتوي حجوزات ومصروفات ومهمتي تنظيف مصطنعة فقط. يجب أن تتضمن المهام:

- UUID مستقلًا.
- token عشوائيًا من 32 حرف hex.
- `revision: 0`.
- تاريخ إنشاء وانتهاء صالحين.
- صورًا صغيرة مصطنعة فقط.

## 5. النسخة السابقة

قبل كل تطبيق SQL:

1. استخدم Snapshot من Supabase إن كان متاحًا في الخطة.
2. أو نفّذ `pg_dump` إلى ملف محلي مشفر/محمي غير مرفوع إلى Git.
3. تحقق أن dump قابل للقراءة وسجّل checksum.
4. شغّل `supabase-staging-preflight.sql` واحفظ مخرجات metadata دون بيانات.

## 6. ترتيب SQL الإلزامي

1. `sql/staging/01-preflight.sql` — قراءة فقط.
2. `sql/staging/02-schema.sql` — إضافة `owner_id` دون تفعيل RLS.
3. انسخ `supabase-set-staging-owner.sql.example` إلى ملف خاص غير مرفوع،
   واستبدل `<STAGING_MANAGER_USER_UUID>` يدويًا ثم شغّله.
4. `sql/staging/04-rls-and-policies.sql` — يفشل إن كان المالك ناقصًا.
5. طبّق قسم `05-rpc` من `supabase-security-review.sql`.
6. طبّق قسم `06-grants` من الملف نفسه.
7. `sql/staging/07-verification.sql`.

لا تتجاوز المرحلة الثالثة، ولا تشغّل ملف owner بالـplaceholder.

## 7. ربط الواجهة محليًا

أنشئ نسخة اختبار محلية من الصفحتين تقرأ `window.ADWAA_STAGING_CONFIG`.
لا تعدّل القيم المنشورة ولا تنشر النسخة. افتحها عبر خادم محلي، ثم نفّذ خطة
`SUPABASE-STAGING-VALIDATION.md`.

## 8. اختبار Rollback

1. أوقف الصفحة المحلية.
2. نفّذ `sql/staging/08-rollback.sql` فقط بعد مراجعة السياسات القديمة المسجلة.
3. المسار المفضل هو استعادة Snapshot/Dump الكامل.
4. شغّل preflight مجددًا وقارن النتائج.
5. لا تنقل أي SQL إلى Production قبل قبول جميع اختبارات Staging.

