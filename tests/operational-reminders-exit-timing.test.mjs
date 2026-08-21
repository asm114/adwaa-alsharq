import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('الحجز اليومي لا يظهر خروجًا في مساء يوم الدخول',async()=>{
  const js=await read('operational-reminders-center.js');
  assert.match(js,/function bookingExitDateValue\(booking\)[\s\S]*if\(booking\?\.type!==['"]مبيت['"]\)return addDaysLocalISO\(entryDate,1\)/);
  assert.match(js,/fallback=booking\?\.type===['"]مبيت['"]\?['"]8:00 صباحًا['"]:['"]3:00 صباحًا['"]/);
});

test('نافذة الخروج لا تظهر إلا بعد تأكيد دخول العميل',async()=>{
  const js=await read('operational-reminders-center.js');
  assert.match(js,/if\(booking\.status===['"]تم الدخول['"]\)[\s\S]*const exitAt=bookingExitMoment\(booking\)/);
  assert.match(js,/item\.operationalType===['"]exit['"][\s\S]*booking\.status!==['"]تم الدخول['"][\s\S]*resolveReminder\(item\)/);
});
