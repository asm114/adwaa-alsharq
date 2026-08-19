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

test('إصلاح الواجهة يحمل نافذة التنبيهات العلوية',async()=>{
  const cleanup=await read('worker-check-legacy-cleanup.js');
  assert.match(cleanup,/header-alerts-popup\.js\?v=20260819-1/);
});
