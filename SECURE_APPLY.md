# Secure Apply — التطبيق الآمن للتركيب التجاري

`tools/commercial-secure-apply.mjs` هو المرحلة التالية بعد `commercial-provisioner.mjs`.

الهدف: أخذ حزمة عميل صادرة من Provisioner Phase 1 وتطبيقها على **مشروعي Supabase نظيفين ومعزولين**: Core للإدارة وPortal لبوابة العميل.

## حدود Phase 1

هذه المرحلة مخصصة لـ **Fresh Install فقط**. لا تستخدمها لترقية عميل قائم أو لإعادة تشغيلها على مشروع يحتوي بالفعل جداول تجارية أو مستخدمي Auth.

التنفيذ الافتراضي هو **Dry-run** ولا يتصل بـSupabase ولا يكتب أي شيء.

التطبيق الحقيقي يحتاج شرطين معًا:

- `--apply`
- `--confirm CLIENT-ID` مطابق تمامًا لمعرف الحزمة

إذا لم يتحقق الشرطان يبقى التنفيذ Dry-run أو يفشل مغلقًا.

## الحزمة المطلوبة

يجب أن تكون حزمة العميل خارج المستودع العام، وأن تحتوي:

- `provisioning-manifest.json`
- `portal-bootstrap.json`
- `supabase-config.staging.js`

تتحقق الأداة من أن الحزمة صادرة من Provisioner Phase 1، وأن Core وPortal مختلفان، وأن مسارات الـMigrations هي المسارات التجارية المعتمدة فقط، وأن Runtime Config لا يحمل Placeholders فعلية.

## الأسرار

الأسرار **لا تدخل ملف الحزمة ولا GitHub ولا CLI arguments**. عند التطبيق الحقيقي تُقرأ فقط من متغيرات البيئة التالية:

- `COMMERCIAL_CORE_DATABASE_URL`
- `COMMERCIAL_PORTAL_DATABASE_URL`
- `COMMERCIAL_CORE_SERVICE_ROLE_KEY`
- `COMMERCIAL_PORTAL_SERVICE_ROLE_KEY`
- `COMMERCIAL_MANAGER_EMAIL`
- `COMMERCIAL_MANAGER_PASSWORD`

لا تحفظ هذه القيم في ملف داخل المستودع، ولا تضعها في Commit أو PR أو Issue أو Screenshot عام.

## Dry-run

مثال عام:

```text
node tools/commercial-secure-apply.mjs --package /secure/customer-build
```

Dry-run يراجع الحزمة ومسارات الـMigrations ويعرض فقط Project Refs وعدد الـMigrations. لا يحتاج الأسرار ولا `psql` ولا اتصالًا خارجيًا.

## Apply

بعد مراجعة Dry-run وإعداد بيئة آمنة:

```text
node tools/commercial-secure-apply.mjs --package /secure/customer-build --apply --confirm CLIENT-0001
```

يجب أن تكون متغيرات البيئة السرية مجهزة خارج GitHub قبل التشغيل.

## ماذا يفعل Apply

1. يتحقق أن Database URL الخاص بكل Backend يطابق Project Ref الموجود في الحزمة.
2. يتحقق من توفر `psql`.
3. يتأكد أن Core وPortal لا يحتويان جداول Commercial سابقة.
4. يتأكد أن Auth في المشروعين فارغ قبل أي Migration فعلية.
5. يطبق Core Migrations داخل Transaction واحدة باستخدام `ON_ERROR_STOP`.
6. يتحقق من الجداول الأساسية لـCore.
7. يطبق Portal Migrations داخل Transaction واحدة.
8. يتحقق من الجداول الأساسية للبوابة وتشييك العامل.
9. ينشئ مدير Auth مستقلًا في Core وPortal باستخدام نفس البريد/كلمة المرور المدخلين وقت التشغيل، لكن UUID مختلف لكل مشروع.
10. يربط UUID الخاص بكل مدير في جدول العضوية المناسب.
11. يطبق بيانات `portal-bootstrap.json` على معلومات المنشأة والتواصل.

## حماية الأسرار في psql

Database URL لا يمر كوسيط في سطر أوامر `psql`. الأداة تحلل الرابط وتضع بيانات الاتصال داخل متغيرات `PG*` للـprocess الفرعي، حتى لا يظهر Password داخل argv.

## حدود الذرية والاسترجاع

كل مجموعة Migrations داخل Backend واحد تستخدم Transaction واحدة، لكن Core وPortal مشروعان منفصلان، لذلك **لا توجد Transaction واحدة تشمل المشروعين معًا**.

إذا نجح أحد المشروعين وفشل الآخر، تعتبر النسخة التجريبية غير مكتملة ويجب التوقف، توثيق موضع الفشل، ثم إعادة Fresh Install على مشاريع نظيفة أو إجراء استرجاع واضح قبل إعادة المحاولة. لا تستخدم إعادة تشغيل عمياء على مشروع جزئي.

## ما لا تفعله هذه المرحلة

- لا تنشئ مشاريع Supabase تلقائيًا.
- لا تخزن Service Role أو Database Password.
- لا تطبق تحديثات على عميل قائم.
- لا تغير أضواء الشرق Production أو Staging.
- لا تفتح طلبات الحجز تلقائيًا؛ تبقى قيمة Bootstrap هي المصدر.
- لا تعتبر نجاح الاختبارات المحلية دليلًا على نجاح Fresh Install حي؛ الاختبار الحي يتم لاحقًا على مشروعين تجريبيين معزولين.

## الخطوة التالية بعد اعتماد هذه المرحلة

إنشاء Core وPortal نظيفين لأول عميل تجريبي، تشغيل Dry-run، ثم تنفيذ Fresh Install بإشراف واضح، وبعدها اختبار الدخول والحجز والبوابة والعقد وتشييك العامل والتنبيهات. بعد نجاح ذلك فقط يبدأ تصميم مسار Upgrade للعملاء القائمين.
