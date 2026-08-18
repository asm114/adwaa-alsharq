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
  muted: "#61706B"
typography:
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(20px, 3vw, 25px)"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.7
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.4
rounded:
  control: "12px"
  card: "16px"
spacing:
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Design System: أضواء الشرق

## Overview

**Creative North Star: "مركز القيادة الهادئ"**

واجهة عربية RTL فاخرة بضبط النفس، تقدّم الإجراء اليومي قبل الأرقام. تعتمد التباين الواضح، المساحات الهادئة، والذهبي كإشارة محدودة لا كلون نص أساسي.

**Key Characteristics:**

- Mobile First مع ترتيب تشغيلي ثابت على الهاتف.
- بطاقة بيضاء واحدة لكل قرار أو مجموعة إجراءات مترابطة.
- أخضر عميق للأفعال الأساسية، وذهبي محدود للحالة والزخرفة.
- لا تكرار للمعلومة أو زر الإجراء نفسه في الرئيسية.

## Colors

لوحة خضراء هادئة فوق خلفية رمادية فاتحة، مع ذهبي مضبوط وتباين نصي قوي.

**The One Identity Rule.** لا تُدخل البنفسجي أو طبقة ألوان منافسة؛ تستخدم الواجهة الأدوار اللونية المعرّفة في التوكنز فقط.

**The Accessible Gold Rule.** الذهبي الزخرفي مخصص للنقاط والحدود؛ النص الذهبي يستخدم درجة `gold-text` الأغمق.

## Typography

**Display Font:** System UI
**Body Font:** System UI

**Character:** عربية واضحة وعملية بأوزان قوية للعناوين والإجراءات، من دون استعراض زخرفي.

### Hierarchy

- **Title** (800، متجاوب): اسم الشاشة وعناوين الأقسام الأساسية.
- **Body** (500، 14px): معلومات الحجز وشرح الإجراء.
- **Label** (800، 12px): الحالات والأرقام المصغرة.

## Layout

الرئيسية عمود واحد على الهاتف بهذا التسلسل: الحالة، إجراءات اليوم، الحجز القادم، التنبيهات، الاختصارات، الأرقام. عند عرض اللابتوب تتحول المناطق التشغيلية إلى شبكة من عمودين، بينما يبقى ملخص الأرقام بعرض كامل. الحاوية القصوى 1180px، وأهداف اللمس لا تقل عن 44px.

## Elevation & Depth

العمق محيطي خفيف للبطاقات والرأس فقط؛ الحدود الرقيقة والفروق اللونية تحمل معظم الفصل البصري. لا تستخدم ظلالًا حادة أو إزاحات زخرفية.

**The Quiet Surface Rule.** كل سطح ساكن؛ الظل يساعد على الفصل ولا ينافس المحتوى.

## Shapes

البطاقات بزوايا ناعمة متوسطة (16px)، وعناصر التحكم أصغر قليلًا (12px). الأيقونات خطية داخل مربعات هادئة، والحالات تستخدم نقطة لونية بسيطة.

## Components

### Buttons

- **Primary:** أخضر رئيسي مع نص أبيض، ارتفاع 44px على الأقل.
- **Secondary:** أبيض بحد رمادي مخضر ونص أخضر.
- **Focus:** حلقة مرئية خارج الحد؛ لا يعتمد التركيز على اللون وحده.

### Cards / Containers

- **Background:** سطح أبيض فوق الخلفية العامة.
- **Border:** خط رمادي مخضر رقيق.
- **Internal Padding:** 14–16px في الهاتف و16–20px في الشاشات الأوسع.

### Navigation

شريط سفلي على الهاتف مع حالة نشطة واضحة و`aria-current="page"`. أدوات الرجوع والتحديث لا تظهر في رأس الرئيسية.

### Daily Action Row

يعرض نوع الإجراء، العدد، ملخصًا قصيرًا، وزرًا واحدًا مباشرًا. لا يظهر إذا لم توجد مهمة فعلية.

## Do's and Don'ts

### Do:

- **Do** رتّب العمل اليومي قبل مؤشرات الأداء.
- **Do** اعرض حالة قديمة بصيغة تحتاج تأكيدًا مع وقت آخر تحديث.
- **Do** استخدم SVG دلاليًا وأهداف لمس لا تقل عن 44px.

### Don't:

- **Don't** تكرر الحجز القادم أو زر إضافة الحجز في الرئيسية.
- **Don't** تعيد النسخ الاحتياطي أو التحليلات الطويلة أو أفضل العملاء إلى الرئيسية.
- **Don't** تخفِ لوحة اليوم على الشاشات الصغيرة.
