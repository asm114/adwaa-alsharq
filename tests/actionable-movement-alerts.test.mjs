import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('تنبيه الحركة يتيح تحديث حالة الدخول أو الخروج مباشرة',async()=>{
  const reminders=await read('operational-reminders-center.js');
  assert.match(reminders,/window\.confirmOperationalMovement=confirmOperationalMovement/);
  assert.match(reminders,/targetStatus===['"]تم الدخول['"]\?['"]entry['"]:targetStatus===['"]تم الخروج['"]\?['"]exit['"]/);
  assert.match(reminders,/return setBookingStatus\(booking,targetStatus,item\)/);
});

test('ملخص حركة اليوم يتحول إلى بطاقة مرتبطة بالحجز نفسه',async()=>{
  const popup=await read('header-alerts-popup.js');
  assert.match(popup,/function enhanceMovementAlerts\(\)/);
  assert.match(popup,/نعم، دخل العميل/);
  assert.match(popup,/نعم، خرج العميل/);
  assert.match(popup,/window\.confirmOperationalMovement/);
});
