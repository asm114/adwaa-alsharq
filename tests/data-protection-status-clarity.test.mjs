import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const clarity=fs.readFileSync('data-protection-status-clarity.js','utf8');
const loader=fs.readFileSync('portal-dedicated-backend-compat.js','utf8');

test('مركز حماية البيانات يعرض سبب حالة يحتاج مراجعة مباشرة على الجوال',()=>{
  assert.match(clarity,/سبب أن الحالة تحتاج مراجعة/);
  assert.match(clarity,/protectionReviewSummary/);
  assert.match(clarity,/protectionReason-protectionLevel/);
  assert.match(clarity,/protectionReason-protectionSystemStatus/);
  assert.match(clarity,/protectionReason-protectionSyncStatus/);
  assert.match(clarity,/غير موجودة داخل مخزن النسخ الآمن في هذا المتصفح على هذا الجهاز/);
});

test('سبب حالة النظام مبني على نتائج الفحص الفعلية وليس نصًا ثابتًا',()=>{
  assert.match(clarity,/runSystemHealthChecks/);
  assert.match(clarity,/report\?\.results/);
  assert.match(clarity,/item\.severity!==['"]ok['"]/);
});

test('توضيح حالة الحماية لا يكتب بيانات إنتاج ولا ينفذ طلبات شبكة',()=>{
  assert.doesNotMatch(clarity,/\.from\s*\(/);
  assert.doesNotMatch(clarity,/\.insert\s*\(/);
  assert.doesNotMatch(clarity,/\.update\s*\(/);
  assert.doesNotMatch(clarity,/\.delete\s*\(/);
  assert.doesNotMatch(clarity,/fetch\s*\(/);
});

test('المسار الرسمي يحمل طبقة توضيح أسباب الحماية',()=>{
  assert.match(loader,/data-protection-status-clarity\.js\?v=20260831-1/);
});
