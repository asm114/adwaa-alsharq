import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const js=await readFile(new URL('../calendar-approved-design.js',import.meta.url),'utf8');
const css=await readFile(new URL('../calendar-approved-design.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('approved calendar layer is loaded independently',()=>{
  assert.match(loader,/calendar-approved-design\.css\?v=20260826-1/);
  assert.match(loader,/calendar-approved-design\.js\?v=20260826-1/);
  assert.match(loader,/approvedCalendarDesign/);
});

test('calendar keeps customer names and adds monthly occasions',()=>{
  assert.match(js,/calendar-approved-client/);
  assert.match(js,/مناسبات هذا الشهر/);
  assert.match(js,/سعر المناسبة يحدد من قبل الإدارة/);
  assert.match(js,/اليوم الوطني السعودي/);
  assert.match(js,/يوم التأسيس/);
});

test('calendar holiday pricing is read-only',()=>{
  assert.match(js,/\.from\('customer_portal_seasons'\)\.select/);
  assert.doesNotMatch(js,/\.from\([^\n]+\)\.(?:insert|update|delete|upsert)\s*\(/);
  assert.doesNotMatch(js,/persist\s*\(|localStorage\.(?:setItem|removeItem|clear)\s*\(/);
});

test('styles are scoped to calendar view',()=>{
  const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=stripped.split('{').map(x=>x.split('}').pop()?.trim()).filter(Boolean);
  assert.match(css,/#calendarView/);
  assert.ok(selectors.length>0);
  assert.doesNotMatch(stripped,/supabase|localStorage|booking_id/i);
});
