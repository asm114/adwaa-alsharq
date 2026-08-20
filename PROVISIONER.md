# Commercial Provisioner — Phase 1

## الهدف

هذه المرحلة تبني **أداة تجهيز تحضيرية Offline** لنسخة العميل التجاري. لا تتصل بـSupabase، ولا تنشئ مستخدم Auth، ولا تطبق Migrations، ولا تقبل Service Role Key أو كلمة مرور أو Token.

الهدف هو تحويل بيانات العميل العامة وإعدادات النشر إلى حزمة قابلة للتدقيق قبل أي كتابة على Backend العميل.

## لماذا Offline أولًا؟

فصل التحضير عن التنفيذ يقلل مخاطر:

- توجيه نسخة عميل إلى مشروع Supabase خاطئ.
- استخدام Core وPortal نفسيهما بالخطأ.
- ترك `CHANGE_ME_*` داخل النسخة.
- خلط Namespace/Cache/Auth بين عميلين.
- إدخال Service Role أو كلمات مرور في GitHub.
- نسخ هوية أضواء الشرق إلى عميل جديد يدويًا.

## التشغيل

انسخ `tools/provisioner.example.json` إلى مسار **خارج هذا المستودع العام** ثم عبئ بيانات العميل هناك.

مثال:

```bash
node tools/commercial-provisioner.mjs \
  --input /secure/customer.json \
  --output /secure/customer-build
```

الأداة ترفض عمدًا أن يكون ملف الإدخال أو مجلد الإخراج داخل المستودع.

## ناتج Phase 1

تنتج الحزمة أربعة ملفات:

1. `supabase-config.staging.js`
   - إعداد Runtime مكتمل للعميل.
   - يحتوي Publishable Keys فقط؛ لا يحتوي Service Role.
   - لا يبقى فيه `CHANGE_ME_*`.

2. `provisioning-manifest.json`
   - معرف العميل والنسخة والهوية وProject Refs.
   - لا يكرر Publishable Keys.
   - يسجل مسارات Commercial Migrations المطلوب تطبيقها لاحقًا.

3. `portal-bootstrap.json`
   - بيانات المنشأة العامة وبيانات التواصل التي ستطبقها مرحلة Secure Apply لاحقًا.
   - لا يحتوي بيانات حجوزات أو عملاء تشغيلية.

4. `README.txt`
   - Checklist قصير خاص بالحزمة الناتجة.

## المدخلات

### هوية النسخة

- `clientId`: معرف داخلي مثل `CLIENT-0001`. ليس ترخيصًا أو تسجيلًا حكوميًا.
- `deploymentId`: معرف تقني ثابت مثل `andalus-resort`.
- `runtimeEnvironment`: `staging` أو `production`.
- `basePath`: مسار النشر مثل `/andalus-resort/`.
- `authorizedCustomer`: اسم المنشأة المصرح لها باستخدام النسخة.

### الهوية التجارية

- الاسم.
- نوع المنشأة.
- الموقع.
- الوصف.

### Backends

- Core Project Ref + Publishable Key.
- Portal Project Ref + Publishable Key.
- يجب أن يكون المشروعان مختلفين حسب المعمارية الحالية.

### Portal Bootstrap

- معلومات المنشأة العامة.
- أوقات الدخول والخروج.
- الموقع وروابط التواصل.
- المزايا.
- بيانات التواصل العامة.

تبدأ `bookingRequestsOpen` مغلقة ما لم يطلب الإدخال فتحها صراحةً، والأفضل إبقاؤها مغلقة حتى نجاح Fresh Install.

## ضوابط الأسرار

Provisioner Phase 1 يرفض حقولًا مثل:

- `serviceRoleKey`
- `password`
- `secret`
- `privateKey`
- `accessToken`
- `refreshToken`

لا تُدخل هذه القيم في JSON التحضيري ولا تحفظها في GitHub.

## ما لا تفعله Phase 1

هذه المرحلة **لا**:

- تنشئ مشاريع Supabase.
- تطبق SQL/Migrations.
- تنشئ مستخدم المدير في Auth.
- تسجل UUID المدير في `commercial_admins` أو `customer_portal_admins`.
- ترفع شعارًا أو توقيعًا أو ختمًا.
- تنشر نسخة العميل.

هذه العمليات ستكون في **Secure Apply / Fresh Install** بعد اعتماد هذه المرحلة واختبارها.

## ترتيب المرحلة التالية

1. إنشاء Core وPortal معزولين ونظيفين لأول عميل تجريبي.
2. تطبيق Commercial Migrations من GitHub.
3. بناء Secure Apply الذي يستخدم الأسرار وقت التنفيذ فقط من بيئة آمنة، ولا يكتبها إلى GitHub أو ملفات الحزمة.
4. إنشاء مدير Auth وربط UUID في جداول العضوية.
5. تطبيق `portal-bootstrap.json`.
6. اختبار Fresh Install كامل.

## حقوق الملكية

حقوق النظام محفوظة لعبدالعزيز الفوزان وفق `PROPRIETARY_NOTICE.md`. بيانات العميل التشغيلية تبقى للعميل، و`clientId` معرف داخلي للنسخة ولا يمثل اعتمادًا أو تسجيلًا حكوميًا.
