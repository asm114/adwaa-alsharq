# فحص OAuth على Windows

الحزمة `Adwaa-OAuth-Local-Check.zip` تحتوي ثلاثة سكربتات فقط، بلا بيانات اعتماد.
تحتوي نسخة `check_oauth_local.py` من Commit
`8402355a7e818df98a64212ffc51aee9b97dc04b`.

فك الملفات الثلاثة مباشرة داخل `C:\Adwaa-Backup`، بجوار ملف العميل الأصلي
من Google (يحتوي قسم `installed` أو `web`) و`drive_oauth_token.json`
(يحتوي `refresh_token`). انقر مرتين على `Run-OAuth-Check.cmd`.
يلزم Python 3 حديث مع Python Launcher (`py`) واتصال إنترنت لتثبيت المكتبات.
الحزمة لم تُختبر على جهاز Windows فعلي؛ اختبارات الملفات والنقل اصطناعية.

المشغّل ينشئ `.oauth-check-venv` للمكتبات فقط. لا يُعدّل ملفات التفويض أو
يحفظ رموزًا جديدة. جميع بيانات التفويض تقرأ إلى الذاكرة، وتُرسل فقط إلى
`https://oauth2.googleapis.com/token` مع TLS ومنع redirects. لا يصل إلى ملفات
Drive ولا إلى GitHub أو Supabase. المخرجات رمز تشخيص ثابت فقط. لا تستخدم
تسجيل HTTP خارجيًا أو أدوات اعتراض تفك TLS أثناء الفحص.

`OAUTH_LOCAL_OK` نجاح التفويض والنطاق، وليس إثبات تطابق أسرار GitHub.
`LOCAL_CLIENT_BINDING_MISMATCH` اختلاف بيانات العميل بين الملفين.
`LOCAL_CLIENT_FILE_AMBIGUOUS` وجود أكثر من ملف عميل؛ يتوقف بدل التخمين.
`LOCAL_PYTHON_SETUP_REQUIRED` غياب مشغّل Python أو فشل إنشاء البيئة.
`LOCAL_DEPENDENCY_SETUP_FAILED` تعذر تثبيت المكتبات.
بقية رموز OAuth لا تحتوي نص استجابة Google أو بيانات اعتماد.

لا ترفع ملفات JSON أو مجلد البيئة المحلية إلى GitHub. الحزمة مخصصة للفحص
فقط، ولا تشغّل النسخ أو الاستعادة أو الجدولة أو إنشاء المجلدات.
