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

test('Commercial pricing migration is neutral, public-readable, and admin-writable only',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820005000_portal_pricing.sql');
  assertCustomerNeutral(sql,'Portal pricing');
  assert.match(sql,/create table if not exists public\.customer_portal_pricing/i);
  assert.match(sql,/weekday_price numeric\(10,2\) not null default 0/i);
  assert.match(sql,/weekend_price numeric\(10,2\) not null default 0/i);
  assert.match(sql,/updated_by uuid references auth\.users\(id\)/i);
  assert.match(sql,/new\.updated_by = auth\.uid\(\)/i);
  assert.match(sql,/check \(id = 'main'\)/i);
  assert.match(sql,/weekday_price >= 0/i);
  assert.match(sql,/weekend_price >= 0/i);
  assert.match(sql,/values\s*\(\s*'main'\s*,\s*0\s*,\s*0\s*\)/i);
  assert.match(sql,/grant select \(id, weekday_price, weekend_price\)[\s\S]*to anon/i);
  assert.match(sql,/grant insert, update on table public\.customer_portal_pricing to authenticated/i);
  assert.match(sql,/admins read customer portal pricing/i);
  assert.match(sql,/public\.is_resort_admin\(\)/i);
  assert.doesNotMatch(sql,/grant\s+delete/i);
  assert.doesNotMatch(sql,/for\s+delete/i);
});

test('Current customer portal runtime still uses the commercial pricing contract',async()=>{
  const runtime=await read('resort/portal.js');
  assert.match(runtime,/customer_portal_pricing/i);
  assert.match(runtime,/select\('id,weekday_price,weekend_price'\)/i);
  assert.match(runtime,/weekday_price/i);
  assert.match(runtime,/weekend_price/i);
});

test('Portal admin pricing writes remain compatible with audit metadata',async()=>{
  const runtime=await read('portal-admin.js');
  assert.match(runtime,/from\(PORTAL_PRICING_TABLE\)\.upsert\(\{[\s\S]*updated_by:currentUser\?\.id\|\|null/i);
});
