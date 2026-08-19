import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('قائمة المزيد لا تعرض التنظيف أو اسم العامل القديم',async()=>{
  const js=await read('simplified-ui.js');
  assert.match(js,/isRetiredCleaningLabel/);
  assert.match(js,/value\.includes\('التنظيف'\)\|\|value\.includes\('جميل'\)/);
  assert.match(js,/if\(isRetiredCleaningLabel\(label\)\)\{button\.remove\(\);return\}/);
  assert.doesNotMatch(js,/'التنظيف':'مهام التنظيف والمتابعة'/);
});

test('الرئيسية تزيل بطاقة تنظيف مطلوب حتى لو أعاد الرندر إنشاءها',async()=>{
  const js=await read('home-dashboard-polish.js');
  assert.match(js,/removeLegacyCleaningUi/);
  assert.match(js,/تنظيف مطلوب\|مهمة تنظيف\|فتح التنظيف\|التنظيف وجميل/);
  assert.match(js,/childList:true,subtree:true/);
  assert.doesNotMatch(js,/innerHTML='<b>🧹<\/b>التنظيف وجميل'/);
});

test('تحميل تحسينات الرئيسية يستخدم نسخة كاش جديدة',async()=>{
  const js=await read('subscription-booking-type.js');
  assert.match(js,/home-dashboard-polish\.js\?v=20260819-3/);
});
