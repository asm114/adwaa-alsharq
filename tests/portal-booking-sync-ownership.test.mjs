import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../portal-booking-sync-stable.js',import.meta.url),'utf8');

test('portal booking sync creates booking-owned unavailable rows',()=>{
  assert.match(source,/source_type:SOURCE_BOOKING,booking_id:owner/);
  assert.match(source,/createPeriod\(client,date,booking\.id\)/);
});

test('portal booking sync deletes only owned booking rows',()=>{
  assert.match(source,/\.delete\(\)\.eq\('id',id\)\.eq\('source_type',SOURCE_BOOKING\)/);
  assert.match(source,/query=query\.eq\('booking_id',owner\)/);
  assert.match(source,/deletePeriod\(client,id,bookingId\)/);
});
