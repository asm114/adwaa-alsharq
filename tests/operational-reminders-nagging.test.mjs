import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('التنبيه التشغيلي لا يلاحق المستخدم كل 30 دقيقة',async()=>{
  const js=await read('operational-reminders-center.js');
  assert.match(js,/const DEFAULT_SNOOZE_MINUTES=120/);
  assert.match(js,/const MAX_POPUP_DEFERS=2/);
  assert.match(js,/function popupEligible\(item\)[\s\S]*popupDeferCount\(item\)<MAX_POPUP_DEFERS[\s\S]*!snoozed\(item\)/);
  assert.match(js,/item\.popupDeferCount=popupDeferCount\(item\)\+1/);
  assert.match(js,/item\.popupDeferCount>=MAX_POPUP_DEFERS[\s\S]*item\.popupSuppressed=true[\s\S]*item\.snoozedUntil=''/);
  assert.match(js,/لا، ذكرني بعد ساعتين/);
  assert.match(js,/إغلاق وإبقاؤه في التنبيهات/);
  assert.match(js,/if\(popupEligible\(item\)\)due\.push/);
  assert.doesNotMatch(js,/DEFAULT_SNOOZE_MINUTES=30/);
});
