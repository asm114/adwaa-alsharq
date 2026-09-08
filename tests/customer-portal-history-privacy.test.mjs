import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('بوابة العملاء تخفي حالة الحجوزات المنتهية من التقويم العام',async()=>{
  const source=await read('resort/portal-today-highlight.js');
  assert.match(source,/function hideHistoricalAvailability\(grid\)/);
  assert.match(source,/iso<riyadhIso\(\)/);
  assert.match(source,/classList\.remove\('available','unavailable','selected','portal-today'\)/);
  assert.match(source,/classList\.add\('portal-past'\)/);
  assert.match(source,/status\.textContent='منتهي'/);
  assert.match(source,/day\.disabled=true/);
  assert.match(source,/querySelectorAll\('em,b'\).*remove/);
});

test('التقويم العام لا يسمح بالرجوع إلى شهر أقدم من الشهر الحالي',async()=>{
  const source=await read('resort/portal-today-highlight.js');
  assert.match(source,/function enforceCurrentMonthFloor\(\)/);
  assert.match(source,/calendarMonthKey\(\)<=riyadhIso\(\)\.slice\(0,7\)/);
  assert.match(source,/event\.stopImmediatePropagation\(\)/);
  assert.match(source,/previous\.disabled=atFloor/);
});

test('طبقة خصوصية التقويم لا تكتب إلى Supabase ولا تعدل بيانات الحجوزات',async()=>{
  const source=await read('resort/portal-today-highlight.js');
  assert.doesNotMatch(source,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|portalUnavailablePeriodIds|resort_bookings|app_state/);
});
