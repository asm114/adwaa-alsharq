import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../document-preview-controls.js',import.meta.url),'utf8');

test('مشاركة العقد ترسل ملفًا فعليًا بدل نص فقط',()=>{
  assert.match(source,/new File\(\[source\],ADWAA_DOC_FILE_NAME/);
  assert.match(source,/navigator\.canShare\(\{files:\[file\]\}\)/);
  assert.match(source,/navigator\.share\(\{title:ADWAA_DOC_SHARE_TEXT,text:ADWAA_DOC_SHARE_TEXT,files:\[file\]\}\)/);
  assert.doesNotMatch(source,/navigator\.share\(\{title:ADWAA_DOC_SHARE_TEXT,text:ADWAA_DOC_SHARE_TEXT\}\)/);
});

test('ملف العقد المشترك نسخة ثابتة بدون شريط الأزرار والسكربتات',()=>{
  assert.match(source,/clone\.querySelector\('#adwaaDocToolbar'\)\?\.remove\(\)/);
  assert.match(source,/clone\.querySelectorAll\('script'\)\.forEach\(node=>node\.remove\(\)\)/);
  assert.match(source,/type:'text\/html;charset=utf-8'/);
});

test('واجهة العقد توضّح فرق مشاركة الملف وفتح واتساب',()=>{
  assert.match(source,/>مشاركة الملف<\/button>/);
  assert.match(source,/>فتح واتساب العميل<\/button>/);
  assert.match(source,/طباعة \/ حفظ PDF/);
});
