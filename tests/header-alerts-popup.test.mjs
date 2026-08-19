import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('جرس التنبيهات يفتح قائمة واضحة بدل النزول لأسفل الصفحة',async()=>{
  const popup=await read('header-alerts-popup.js');
  assert.match(popup,/window\.focusDashboardAlerts=openHeaderAlertsPopup/);
  assert.match(popup,/التنبيهات المهمة/);
  assert.match(popup,/#alertsList \.action-alert/);
  assert.match(popup,/cloneNode\(true\)/);
  assert.doesNotMatch(popup,/scrollIntoView/);
});

test('رقم الجرس يطابق التنبيهات الظاهرة فعليًا بعد تنظيف البطاقات القديمة',async()=>{
  const popup=await read('header-alerts-popup.js');
  assert.match(popup,/function syncHeaderAlertCount\(\)/);
  assert.match(popup,/currentAlertCards\(\)\.length/);
  assert.match(popup,/new MutationObserver\(\(\)=>queueMicrotask\(syncHeaderAlertCount\)\)/);
  assert.match(popup,/observer\.observe\(root,\{childList:true,subtree:true,attributes:true/);
  assert.match(popup,/window\.syncHeaderAlertCount=syncHeaderAlertCount/);
});

test('إصلاح الواجهة يحمل نسخة محدثة من نافذة التنبيهات العلوية',async()=>{
  const cleanup=await read('worker-check-legacy-cleanup.js');
  assert.match(cleanup,/header-alerts-popup\.js\?v=20260819-2/);
});
