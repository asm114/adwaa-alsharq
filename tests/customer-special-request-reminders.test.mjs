import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../customer-special-request-reminders.js',import.meta.url),'utf8');
const loader=await readFile(new URL('../worker-check-legacy-cleanup.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('special request reminder layer has a direct cache-busted loader and keeps the legacy fallback',()=>{
  assert.match(html,/customer-special-request-reminders\.js\?v=20260829-1/);
  assert.match(loader,/customer-special-request-reminders\.js\?v=20260828-1/);
  assert.match(source,/__special_request__:/);
  assert.doesNotMatch(source,/supabase/i);
});

test('request is customer-level and applies to ordinary or subscription bookings',()=>{
  assert.match(source,/customerKeyFromBooking=booking=>normalizePhone\(booking\?\.phone\)\|\|String\(booking\?\.name/);
  assert.match(source,/for\(const booking of bookings\(\)\)/);
  assert.doesNotMatch(source,/!booking\.subscriptionId|subscriptionId\s*===\s*null/);
});

test('default reminder is one day before each booking and completion is per booking occurrence',()=>{
  assert.match(source,/DEFAULT_DAYS_BEFORE=1/);
  assert.match(source,/shiftDate\(booking\.date,-config\.daysBefore\)/);
  assert.match(source,/ops:\$\{SPECIAL_TYPE\}:\$\{booking\.id\}:\$\{booking\.date\}:\$\{config\.updatedAt\}/);
  assert.match(source,/تم التنفيذ/);
  assert.match(source,/completeCustomerSpecialRequest/);
});

test('disabled customers do not produce due reminders',()=>{
  assert.match(source,/if\(!config\?\.enabled\|\|!config\.text\)continue/);
});
