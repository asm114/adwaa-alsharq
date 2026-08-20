import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

const forbiddenIdentity=[
  /asm114@hotmail\.com/i,
  /أضواء الشرق/,
  /القاع البارد/,
  /560442799/,
  /adwaa_al_sharq/i,
  /pgdvlklpyrvmwzitsmbw/i,
  /ztqqdjryvecscidxxbfe/i
];

test('Commercial unavailable periods are fresh-install safe and booking-sync compatible',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820004000_portal_unavailable_periods.sql');
  for(const pattern of forbiddenIdentity)assert.doesNotMatch(sql,pattern);

  assert.match(sql,/create table if not exists public\.customer_portal_unavailable_periods/i);
  assert.match(sql,/source_type text not null default 'manual'/i);
  assert.match(sql,/booking_id text/i);
  assert.match(sql,/updated_by uuid references auth\.users\(id\)/i);
  assert.match(sql,/new\.updated_by = auth\.uid\(\)/i);
  assert.match(sql,/source_type in \('legacy','manual','booking'\)/i);
  assert.match(sql,/source_type = 'booking'[\s\S]*booking_id/i);
  assert.match(sql,/exclude using gist \(daterange\(start_date, end_date, '\[\]'\) with &&\)/i);
  assert.match(sql,/grant select \(id, start_date, end_date, source_type, booking_id\)[\s\S]*to anon/i);
  assert.match(sql,/admins read customer portal unavailable periods/i);
  assert.match(sql,/admins insert customer portal unavailable periods/i);
  assert.match(sql,/admins update customer portal unavailable periods/i);
  assert.match(sql,/admins delete customer portal unavailable periods/i);
  assert.match(sql,/public\.is_resort_admin\(\)/i);

  assert.doesNotMatch(sql,/insert\s+into\s+public\.customer_portal_unavailable_periods/i);
  assert.doesNotMatch(sql,/update\s+public\.customer_portal_unavailable_periods\s+set/i);
});

test('Booking sync uses the commercial unavailable ownership columns',async()=>{
  const runtime=await read('portal-booking-sync-stable.js');
  assert.match(runtime,/select\('id,start_date,end_date,source_type,booking_id'\)/i);
  assert.match(runtime,/source_type:SOURCE_BOOKING,booking_id:owner/i);
  assert.match(runtime,/eq\('source_type',SOURCE_BOOKING\)/i);
});

test('Portal admin unavailable writes remain compatible with audit metadata',async()=>{
  const runtime=await read('portal-admin.js');
  assert.match(runtime,/updated_by:currentUser\?\.id\|\|null/i);
  assert.match(runtime,/from\(PORTAL_UNAVAILABLE_TABLE\)/i);
});
