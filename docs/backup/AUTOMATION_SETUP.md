# فصل النسخ اليومي — تجهيز غير مفعّل

## الأدلة والحالة الإدارية

- إصلاح Docker يستعمل memfd مختومًا كـstdin محدود لـDocker CLI، مع مهلة وفحص
  طول الوجهة. لا plaintext على قرص المضيف؛ أسماء الحاويات والمسارات محصورة.
  الاختبارات تكشف truncation وtimeout وتتحقق من EOF.
- [40471492051](https://github.com/asm114/adwaa-alsharq/actions/runs/40471492051)
  على fbe9a63 نجح: Core وPortal واختبار الخدمة الرسمية لـStorage.
- استعادة الحزم الحقيقية مثبتة سابقًا: Core 54 جدولًا/510 صفوف/3 تسلسلات؛
  Portal 73 جدولًا/1299 صفًا/6 تسلسلات؛ API المحلي 31 ملفًا/69,349,839 بايت.
- Health الحي [40466653110](https://github.com/asm114/adwaa-alsharq/actions/runs/40466653110)
  ناجح للمشروعين. تنبيه GitHub ومنع الازدواج نجحا في
  [40463758806](https://github.com/asm114/adwaa-alsharq/actions/runs/40463758806).
  هذا يثبت كتابة التذكرة؛ وصول البريد موثق في APPROVAL_DECISION_2026-10-27.md،
  ولا توجد شهادة مستقلة لإشعارات الجوال.
- **فحص 27 أكتوبر:** API يعرض main بقيمة protected=false. إنشاء بيئة
  production-backup-auto وقراءة أسماء أسرار البيئة رفضا بصلاحية 403.
  لم تُنشأ البيئة أو تُنسخ أسرار، ولم تتغير حماية production-backup.

## الفصل المقترح في الكود

| الاستخدام | البيئة | الضوابط |
|---|---|---|
| backup ثابت ثم استعادة داخل حاوية معزولة فقط | production-backup-auto | main المحمي وحده؛ دون موافقة يومية بعد الاعتماد |
| health، قراءة Drive فقط دون PG أو مفتاح فك التشفير | production-backup-auto | البوابات نفسها، مستقل عن فشل مهمة النسخ |
| restore أو init-drive أو تشخيص/تهيئة يدوي | production-backup | المراجع الحالي؛ لا تخفيف لحمايته |
| watchdog والتنبيه | لا بيئة أسرار | GitHub API وissues:write للتنبيه وحده |

backup-daily.yml لا يقبل operation أو ref من المدخلات. automatic.py يرفض كل
العمليات عدا backup وhealth. تصريح restore الداخلي يخص حاوية network-none
المؤقتة في المحرك فقط؛ لا يسمح بتحديد قاعدة استعادة خارجية. ترخيص إنشاء مجلد
Drive والحذف مقفلان. لا يوجد cron في أي من مسارات daily/health/watchdog.

automation_policy.py يمنع الوصول قبل تفعيل الخطة وموافقة المالك، ويتحقق عبر
GitHub من حماية main وأن قائمة فروع البيئة تحتوي فرع main واحدًا فقط، بلا
tags أو wildcard أو مراجع يومي. يعاد الفحص داخل مهمة الأسرار قبل تشغيل المحرك.
فشل قراءة السياسة أو تخفيف القيود يوقف النسخ ويُصدر فشلًا برمز آمن.
مسار اختبارات النسخ يُسجل الفحوص لكل PR حتى لا تعلق فحوص main المطلوبة
بسبب path filters. يعمل Docker عند تغييرات النسخ/خطتها فقط؛ بقية PRs تسجل
skip معروفًا، وفشل تحديد النطاق يعيد الاختبارات كاملة بدل تجاوزها.

## الإعداد داخل GitHub فقط — لا ترسل أي قيمة سرية للمحادثة

محاولة التنفيذ الإداري عبر GitHub API رُفضت بـ403 لإنشاء ruleset ولإنشاء
production-backup-auto، فتوقف التنفيذ دون تجاوز. جرى التحقق من أسماء checks
الفعلية على 5041f27 ومن مصدرها GitHub Actions (integration_id=15368).
قالب الاستيراد: [main-backup-protection.ruleset.json](main-backup-protection.ruleset.json).
من [صفحة Rulesets](https://github.com/asm114/adwaa-alsharq/settings/rules)
استخدم Import a ruleset إن ظهر، ثم راجع واحفظ. القالب Active على main فقط،
ولا يحتوي Bypass أو أسرارًا. إذا بقيت في شاشة New branch ruleset غير المحفوظة،
استخدم الإعدادات نفسها أدناه بدل إنشاء قاعدتين مكررتين.
`Daily stability checks` هو اسم workflow؛ اسم الـcheck المطلوب هو **stability**.
القالب لا يشترط موافقة مراجِع إضافي (required approvals=0)، لكنه يشترط PR
والفحوص الأربعة الناجحة من GitHub Actions؛ ذلك يمنع قفل مالك وحيد عن دمج PR
بسبب مراجع غير متاح. ويشترط تحديث الفرع مع main، ما قد يحتاج Update branch
وإعادة CI قبل الدمج. لا Restrict updates ولا قفل للفرع ولا قواعد على فروع أخرى.

روابط الإدارة المباشرة:

- [إنشاء Branch ruleset](https://github.com/asm114/adwaa-alsharq/settings/rules/new?target=branch)
- [إنشاء Environment](https://github.com/asm114/adwaa-alsharq/settings/environments/new)
- [Repository variables](https://github.com/asm114/adwaa-alsharq/settings/variables/actions)

1. Settings → Rules → Rulesets: قاعدة Active تستهدف main؛ منع الحذف وforce
   push، واشتراط PR وفحوص stability وsynthetic-only (core) وsynthetic-only
   (portal) وofficial-storage-service قبل الدمج. البوابة تتحقق من هذه القواعد
   الفعلية عبر rules/branches/main؛ protected=true وحده لا يكفي. Classic
   protection وحدها لا تستوفي هذا الفحص. راجع bypass list بحيث لا يسمح لتكامل
   النسخ بتجاوز القواعد، ومراجعي تغييرات workflows. اختر مراجعين متاحين
   فعليًا إذا اشترطت موافقات PR؛ لا تفترض أن صاحب PR يمكنه اعتماد طلبه بنفسه.
2. Settings → Environments → New environment: production-backup-auto.
   Deployment branches and tags: Selected branches and tags → **Branch main
   فقط**. لا تضف أي tag أو فرع آخر. لا required reviewers أو wait timer لهذه
   البيئة وحدها. لا تغيّر production-backup الحالية.
3. أضف **نسخًا من القيم الأصلية نفسها** للأسرار التالية داخل البيئة الجديدة؛
   لا تغيّر القيم أو تنقلها إلى Repository secrets. GitHub لا يتيح تصدير قيم
   الأسرار القديمة؛ استخدم الأصول المحفوظة لديك بواجهة GitHub الآمنة:

   - BACKUP_DRIVE_CLIENT_ID
   - BACKUP_DRIVE_CLIENT_SECRET
   - BACKUP_DRIVE_REFRESH_TOKEN
   - BACKUP_CORE_PGHOST
   - BACKUP_CORE_PGUSER
   - BACKUP_CORE_PGPASSWORD
   - BACKUP_CORE_CA_PEM
   - BACKUP_CORE_ENCRYPTION_KEY
   - BACKUP_CORE_STORAGE_API_KEY
   - BACKUP_PORTAL_PGHOST
   - BACKUP_PORTAL_PGUSER
   - BACKUP_PORTAL_PGPASSWORD
   - BACKUP_PORTAL_CA_PEM
   - BACKUP_PORTAL_ENCRYPTION_KEY
   - BACKUP_PORTAL_STORAGE_API_KEY

4. متغيرات البيئة: BACKUP_DRIVE_ACCOUNT، BACKUP_COST_APPROVED=true، ومرجعا
   BACKUP_CORE_CONFIRMED_PROJECT_REF وBACKUP_PORTAL_CONFIRMED_PROJECT_REF.
   معرفا المجلدين والتقديرات اختيارية لأن runtime.py يستعمل الخطة المثبتة
   ويرفض تبديل المجلدين. يمكن نسخ متغيراتهما الموجودة بالقيم نفسها.
5. Repository **variable** (ليس secret): BACKUP_AUTO_EXECUTION_APPROVED=false.
   يلزم نطاق المستودع لأن admission يعمل بلا بيئة أسرار قبل إطلاق المهام.
   لا تجعله true الآن؛ لا يفعّل وحده شيئًا والخطة تظل disabled.

صلاحيات التكامل الحالي لا تتيح تطبيق الخطوات الإدارية أو نسخ الأسرار. لا
يوجد نقل خفي للقيم ولا token إداري جديد ولا فك تشفير لأسرار GitHub. إنشاء
Environment فارغة وحده لا يعني اكتمال الإعداد أو إثبات صلاحية أسرارها.

## خطة التفعيل — تحتاج اعتمادًا نهائيًا مستقلًا

الوقت المقترح `0 0 * * *` UTC = **03:00 السعودية** يوميًا. health وwatchdog
كل ست ساعات (`30 */6 * * *`). GitHub cron قد يتأخر ولا يضمن الدقيقة نفسها.

بعد مراجعة البيئة والأسرار والحماية، تعرض أدلة CI والنسخ والاستعادة ويطلب
اعتماد نهائي للدمج والتفعيل. فرق التفعيل اللاحق فقط يضيف cron ويجعل enabled
وmonitoring_enabled وموافقة المالك true. تظل deletion_enabled=false دائمًا.
تُختبر أول دورة يدوية على main المعتمد قبل الاعتماد على cron، مع إثبات نجاح
Core وPortal وHealth والتنبيه. لا تنفذ هذه الخطوات من إعداد PR وحده.

watchdog يتابع backup-daily.yml؛ يكشف الغياب/التقادم بعد 30 ساعة أو التعليق
أكثر من ساعتين أو نجاح مشروع واحد. health يفحص markers وأحجام وبصمات الأجزاء
من Drive. هذه مراقبة دورية؛ لا تغني عن الاستعادة الفعلية ولا تكشف تعطيل
GitHub بالكامل دون مراقب خارجي. نافذة الفحص قد تؤخر كشف الغياب إلى 36 ساعة.

## حدود الصلاحيات والاحتفاظ

لا حذف تلقائي ولا تغيير للنسخ القديمة أو مفاتيحها. OAuth drive.file قد يتيح
الحذف على مستوى المزود، وبيانات اعتماد Supabase الحالية قد تتيح الكتابة؛
منع الحذف/تعديل الإنتاج هنا ضوابط الكود والنطاق والعزل، **وليس ادعاءً بأن
المفاتيح نفسها read-only أو أن Drive تخزين WORM**. لا نغيّر هذه المفاتيح.
توسعة الوصول إلى بيئة بلا مراجع تستلزم main محميًا وفحصًا للتغييرات؛ تظل
هذه مخاطرة وصول موثقة. قرر المالك إبقاء OAuth Client Secret رغم ظهوره سابقًا
في صورة؛ لا تدوير ولا تغيير تلقائي، ولا يُعد الظهور وحده دليل اختراق.
