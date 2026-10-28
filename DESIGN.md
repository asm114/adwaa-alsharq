---
name: "أضواء الشرق"
description: "مركز قيادة يومي عربي هادئ لإدارة الحجوزات والتشغيل"
colors:
  primary: "#0F5B4C"
  primary-deep: "#0A4439"
  canvas: "#F4F6F5"
  surface: "#FFFFFF"
  gold-decorative: "#C89231"
  gold-text: "#9A6A16"
  text: "#16231F"
  brand-muted: "#61706B"
  muted: "#52665E"
  field: "#F8FAF9"
  field-stroke: "#B8C9C0"
  surface-stroke: "#DDE6E1"
  rail: "#0A3029"
  section-active: "#E6F1EB"
  error: "#B13B36"
  error-surface: "#FFF6F5"
typography:
  title:
    fontFamily: 'Tahoma, "Segoe UI", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.45
  body:
    fontFamily: 'Tahoma, "Segoe UI", system-ui, sans-serif'
    fontSize: "16px"
    lineHeight: 1.7
  label:
    fontFamily: 'Tahoma, "Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.7
  section-title:
    fontFamily: 'Tahoma, "Segoe UI", system-ui, sans-serif'
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.5
rounded:
  navigator: "8px"
  control: "10px"
  section: "12px"
  card: "16px"
  mobile-sheet: "18px 18px 0 0"
spacing:
  sm: "8px"
  md: "14px"
  lg: "20px"
  section: "24px"
  desktop-edge: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "#234F40"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  booking-section:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.section}"
    padding: "24px"
  booking-nav-current:
    backgroundColor: "{colors.section-active}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.navigator}"
    padding: "8px 16px"
---

# Design System: أضواء الشرق

## Overview

**Creative North Star: "مركز القيادة الهادئ"**

واجهة عربية RTL فاخرة بضبط النفس، تقدّم الإجراء اليومي قبل الأرقام. تعتمد التباين الواضح، المساحات الهادئة، والذهبي كإشارة محدودة لا كلون نص أساسي. يمتد هذا النظام إلى مساحة الإدارة والنماذج الأصلية: حقول فاتحة بحدود واضحة، أقسام منظمة، وتنقل مستمر داخل نموذج الحجز الواحد.

**Key Characteristics:**

- Mobile First مع ترتيب تشغيلي ثابت على الهاتف.
- بطاقة بيضاء واحدة لكل قرار أو مجموعة إجراءات مترابطة.
- أخضر عميق للأفعال الأساسية، وذهبي محدود للحالة والزخرفة.
- لا تكرار للمعلومة أو زر الإجراء نفسه في الرئيسية.

## Colors

لوحة خضراء هادئة فوق خلفية رمادية فاتحة، مع ذهبي مضبوط وتباين نصي قوي. تبقى ألوان الهوية المعتمدة محفوظة؛ يستخدم تحديث مساحة الإدارة `muted` للنص المساعد و`field` للحقول و`rail` للتنقل، بينما يحتفظ `brand-muted` بمرجع الهوية السابق. `error` و`error-surface` مخصصان للتحقق من الحقول.

**The One Identity Rule.** لا تُدخل البنفسجي أو طبقة ألوان منافسة؛ تستخدم الواجهة الأدوار اللونية المعرّفة في التوكنز فقط.

**The Accessible Gold Rule.** الذهبي الزخرفي مخصص للنقاط والحدود؛ النص الذهبي يستخدم درجة `gold-text` الأغمق.

## Typography

**Display Font:** Tahoma, Segoe UI, System UI
**Body Font:** Tahoma, Segoe UI, System UI

**Character:** عربية واضحة وعملية بأوزان قوية للعناوين والإجراءات، من دون استعراض زخرفي. تستخدم مساحة الإدارة الخط نفسه لعناصر التحكم الأصلية.

### Hierarchy

- **Title:** عنوان الشاشة بالحجم المحدد في التوكنز؛ ينخفض إلى 21px عند عرض 700px أو أقل.
- **Section title:** عنوان القسم بالحجم المحدد في التوكنز؛ عنوان نافذة الحوار 22px، وعنوان قسم الحجز 17px.
- **Body:** نص عام وحقول أصلية بالحجم الثابت المحدد؛ الحقول لها ارتفاع سطر 1.5.
- **Label:** تسميات صريحة فوق الحقول بمسافة سفلية 8px. النصوص المساعدة 12–13px، وعناوين تنقل الهاتف 11px.

## Layout

تظل الرئيسية مرتبة بحسب العمل اليومي: الحالة، إجراءات اليوم، الحجز القادم، التنبيهات، الاختصارات، الأرقام. حاوية مساحة الإدارة بحد أقصى 1360px وحواف 28px رأسيًا و32px أفقيًا؛ على الهاتف تصبح 20px و14px. عند عرض 1100px أو أكثر يظهر شريط تنقل دائم على اليمين بعرض 232px وتتحول الرئيسية لشبكة تشغيلية من عمودين. دون ذلك يبقى التنقل سفليًا؛ عند 700px أو أقل يصبح مضغوطًا بثلاثة أعمدة وأزرار بارتفاع 56px مع مراعاة المساحة الآمنة.

نموذج الحجز نافذة مرنة: الرأس، ثم متصفح الأقسام، ثم جسم مستقل التمرير، ثم شريط الحفظ خارج منطقة التمرير. لا يحتاج شريط الحفظ إلى تموضع sticky ليظل ظاهرًا. فوق 700px يصل عرض النافذة إلى 1000px وارتفاعها إلى الأصغر من 1000px و92dvh؛ أقسام العميل والإقامة متجاورة. على الهاتف يبلغ ارتفاعها 96dvh وتصبح الأقسام في عمود واحد، مع حقول الإقامة ذات الامتداد المناسب. مسافة شبكة النموذج العامة 22px رأسيًا و20px أفقيًا، وأقسام الحجز تفصلها 20px.

## Elevation & Depth

بطاقات التشغيل الرئيسية مسطحة بلا ظل؛ الحدود الرقيقة والفروق اللونية تحمل الفصل البصري. يقتصر العمق الأقوى على النوافذ وبطاقة الدخول (`0 24px 70px #122d2426`)، واقتراحات الحقول (`0 8px 24px #163a2520`). خلفية النافذة `#0a211b99` بلا تمويه. شريط الهاتف له ظل خفيف (`0 6px 24px #0a302924`).

**The Quiet Surface Rule.** كل سطح ساكن؛ الظل يساعد على الفصل ولا ينافس المحتوى.

## Shapes

بطاقات التشغيل بزوايا ناعمة متوسطة وفق `card`، وأقسام الحجز وفق `section`، والحقول والأزرار وفق `control`. نافذة الحجز على الهاتف مستديرة في الأعلى فقط. الأيقونات خطية، وأيقونات التنقل SVG بسماكة 1.7. لا تستخدم صورًا زخرفية في مساحة التشغيل.

## Components

### Buttons

- **Primary:** أخضر رئيسي ونص أبيض، ارتفاع أدنى 48px؛ حفظ الحجز 50px، بعرض كامل على الهاتف وحد أقصى 340px على الشاشات الأوسع.
- **Secondary:** أبيض بحد `#bdcec5` ونص أخضر `#234f40`، وارتفاع أدنى 44px؛ التحويم خلفيته `#edf5f0` وحده `#7c9c8d`.
- **Focus:** إطار أخضر 3px وإزاحة 3px. التعطيل يخفض العتامة إلى .55 ويستخدم مؤشر عدم الإتاحة.

### Cards / Containers

سطح أبيض وحد رقيق، بلا ظل لبطاقات الأقسام والمؤشرات والمالية. أقسام نموذج الحجز بحد `#dce5df` وحشو `section`؛ ينخفض الحشو إلى 18px على الهاتف. حالات الفراغ فاتحة بلا حدود متقطعة.

### Inputs / Fields

حقول أصلية فاتحة بحد صريح، وارتفاع أدنى 50px، وحشو وفق `input`؛ textarea لا تقل عن 112px. التحويم يغمق الحد إلى `#7d9c8e`. التركيز يبيض الخلفية ويستخدم حدًا وإطارًا أخضر 2px بإزاحة 2px. الخطأ الأصلي `:user-invalid` أو `aria-invalid=true` يستخدم لوني الخطأ. القراءة فقط وselect المعطل بخلفية `#edf1ef` وحد `#c6d1cb`. مربعات الاختيار وأزرار الراديو 22px وتحتفظ بدلالتها الأصلية.

### Navigation

شريط أخضر داكن دائم على اليمين في سطح المكتب وتنقل سفلي مضغوط في الهاتف. الحالة النشطة بيضاء فوق طبقة بيضاء شفافة، والتحويم أخف. تبقى أدوات الرجوع والتحديث خارج رأس الرئيسية. التنقل المالي مجموعة أزرار قابلة للتمرير بحالة `aria-pressed`، منفصل عن متصفح أقسام الحجز.

### Booking Section Navigator

متصفح دائم فوق جسم النموذج، بأزرار تقفز إلى العميل والإقامة والطلبات الخاصة والدفع والملاحظات والإرسال الموجودة بالفعل. يمرر الجسم ثم ينقل التركيز إلى أول حقل قابل للتحرير، ويعكس موضع التمرير عبر `aria-current="location"`. لا يخفي الأقسام ولا يفك تركيب الحقول ولا يغير مسار الإرسال. التمرير سلس إلا عند تفضيل تقليل الحركة؛ تعطّل انتقالات وتحريكات مساحة الإدارة أيضًا عند هذا التفضيل.

### Dialogs

نافذة بدلالة dialog وaria-modal واسم من عنوانها، وأزرار إغلاق ذات اسم واضح. عند الفتح ينتقل التركيز لأول عنصر مناسب، ويعود إلى أصله عند الإغلاق؛ Tab يلتف داخل النافذة وEscape يستخدم زر الإغلاق ما لم يوجد عنصر aria-busy. هذه أوصاف للسلوك المطبق وليست بديلًا عن اختبار تدفقات الحفظ.

### Daily Action Row

يعرض نوع الإجراء، العدد، ملخصًا قصيرًا، وزرًا واحدًا مباشرًا. لا يظهر إذا لم توجد مهمة فعلية.

### Secondary operational screens

Calendar filters wrap as compact native controls on desktop; the existing compact calendar navigation stays on mobile. Header back and refresh actions use 44px pale-green controls with dark-green icons. Data-protection status cards use three columns above 700px and one column below; long diagnostic text must wrap without narrowing the whole page.

## Do's and Don'ts

### Do:

- **Do** رتّب العمل اليومي قبل مؤشرات الأداء.
- **Do** اعرض حالة قديمة بصيغة تحتاج تأكيدًا مع وقت آخر تحديث.
- **Do** استخدم SVG دلاليًا وأهداف لمس لا تقل عن 44px.

### Don't:

- **Don't** تكرر الحجز القادم أو زر إضافة الحجز في الرئيسية.
- **Don't** تعيد النسخ الاحتياطي أو التحليلات الطويلة أو أفضل العملاء إلى الرئيسية.
- **Don't** تخفِ لوحة اليوم على الشاشات الصغيرة.
