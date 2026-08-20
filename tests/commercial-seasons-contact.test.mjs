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

function assertCustomerNeutral(source,label){
  for(const pattern of forbiddenIdentity){
    assert.doesNotMatch(source,pattern,`${label} must not contain AAS/customer identity: ${pattern}`);
  }
}

test('Commercial seasons migration is neutral and matches current portal contracts',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820006000_portal_seasons.sql');
  const publicRuntime=await read('resort/portal.js');
  const adminRuntime=await read('portal-admin.js');
  assertCustomerNeutral(sql,'Portal seasons');

  assert.match(sql,/create table if not exists public\.customer_portal_seasons/i);
  assert.match(sql,/season_name text not null/i);
  assert.match(sql,/season_price numeric\(10,2\) not null/i);
  assert.match(sql,/season_price >= 0/i);
  assert.match(sql,/start_date <= end_date/i);
  assert.match(sql,/exclude using gist[\s\S]*daterange\(start_date, end_date, '\[\]'\) with &&/i);
  assert.match(sql,/updated_by uuid references auth\.users\(id\)/i);
  assert.match(sql,/grant select \(id, season_name, start_date, end_date, season_price, is_active\)[\s\S]*to anon/i);
  assert.match(sql,/public reads active customer portal seasons/i);
  assert.match(sql,/admins read all customer portal seasons/i);
  assert.match(sql,/admins insert customer portal seasons/i);
  assert.match(sql,/admins update customer portal seasons/i);
  assert.match(sql,/admins delete customer portal seasons/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.customer_portal_seasons/i);

  assert.match(publicRuntime,/select\('id,season_name,start_date,end_date,season_price,is_active'\)/i);
  assert.match(adminRuntime,/from\(PORTAL_SEASONS_TABLE\)/i);
  assert.match(adminRuntime,/updated_by:currentUser\?\.id\|\|null/i);
});

test('Commercial contact migration is schema-only and contains no AAS contact seed',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820007000_portal_contact.sql');
  const publicRuntime=await read('resort/portal.js');
  const adminRuntime=await read('portal-admin.js');
  assertCustomerNeutral(sql,'Portal contact');

  assert.match(sql,/create table if not exists public\.customer_portal_contact/i);
  assert.match(sql,/whatsapp_number text not null/i);
  assert.match(sql,/whatsapp_number ~ '\^\[0-9\]\{8,15\}\$'/i);
  assert.match(sql,/maps_url ~ '\^https:\/\/'/i);
  assert.match(sql,/instagram_url ~ '\^https:\/\/'/i);
  assert.match(sql,/email = '' or email ~/i);
  assert.match(sql,/updated_by uuid references auth\.users\(id\)/i);
  assert.match(sql,/grant select \(id, whatsapp_number, maps_url, instagram_url, email, contact_hours\)[\s\S]*to anon/i);
  assert.match(sql,/admins read customer portal contact/i);
  assert.match(sql,/admins insert customer portal contact/i);
  assert.match(sql,/admins update customer portal contact/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.customer_portal_contact/i);
  assert.doesNotMatch(sql,/for\s+delete/i);

  assert.match(publicRuntime,/select\('id,whatsapp_number,maps_url,instagram_url,email,contact_hours'\)/i);
  assert.match(adminRuntime,/from\(PORTAL_CONTACT_TABLE\)\.upsert\(payload\)/i);
  assert.match(adminRuntime,/updated_by:currentUser\?\.id\|\|null/i);
});
