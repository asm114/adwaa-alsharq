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

test('رقم الجرس يطابق التنبيهات الظاهرة فعليًا بعد أي إعادة رسم',async()=>{
  const popup=await read('header-alerts-popup.js');
  assert.match(popup,/function syncHeaderAlertCount\(\)/);
  assert.match(popup,/currentAlertCards\(\)\.length/);
  assert.match(popup,/new MutationObserver/);
  assert.match(popup,/function wrapRenderAlerts\(\)/);
  assert.match(popup,/removeContractAlerts\(\)/);
  assert.match(popup,/queueMicrotask\(syncHeaderAlertCount\)/);
  assert.match(popup,/window\.renderAlerts=wrapped/);
  assert.match(popup,/window\.syncHeaderAlertCount=syncHeaderAlertCount/);
});

test('تنبيه العقد لا يظهر في جرس التنبيهات ولا يطارد العملاء واحدًا واحدًا',async()=>{
  const popup=await read('header-alerts-popup.js');
  assert.match(popup,/function removeContractAlerts\(\)/);
  assert.match(popup,/إرسال العقد للعميل/);
  assert.match(popup,/card\.remove\(\)/);
  assert.doesNotMatch(popup,/CONTRACT_ALERT_POLICY_START/);
  assert.doesNotMatch(popup,/contractAlertCandidates/);
  assert.doesNotMatch(popup,/الحجز الجديد/);
});

test('تنظيف الواجهة يعيد مزامنة الجرس ويحمل نسخة popup الجديدة',async()=>{
  const cleanup=await read('worker-check-legacy-cleanup.js');
  assert.match(cleanup,/window\.syncHeaderAlertCount\?\.\(\)/);
  assert.match(cleanup,/header-alerts-popup\.js\?v=20260819-5/);
});

test('مركز التنبيهات يحمل نسخة محدثة من تنظيف الواجهة',async()=>{
  const operations=await read('operational-reminders-center.js');
  assert.match(operations,/worker-check-legacy-cleanup\.js\?v=20260828-2/);
});
