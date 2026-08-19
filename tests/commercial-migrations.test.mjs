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

test('Commercial Core migration uses UUID membership instead of a hardcoded manager email',async()=>{
  const sql=await read('supabase/commercial/core/migrations/20260820001000_core_admin_and_app_state.sql');
  assertCustomerNeutral(sql,'Core migration');
  assert.match(sql,/create table if not exists public\.commercial_admins/i);
  assert.match(sql,/user_id uuid primary key references auth\.users\(id\)/i);
  assert.match(sql,/create or replace function public\.is_commercial_admin\(\)/i);
  assert.match(sql,/where a\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql,/create table if not exists public\.app_state/i);
  assert.match(sql,/using \(public\.is_commercial_admin\(\)\)/i);
  assert.doesNotMatch(sql,/auth\.jwt\(\)[\s\S]*email/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.app_state/i);
});

test('Commercial Portal foundation defines admin membership before portal policies depend on it',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820001000_portal_admin_foundation.sql');
  assertCustomerNeutral(sql,'Portal admin foundation');
  assert.match(sql,/create table if not exists public\.customer_portal_admins/i);
  assert.match(sql,/create or replace function public\.is_resort_admin\(\)/i);
  assert.match(sql,/where a\.user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql,/auth\.jwt\(\)[\s\S]*email/i);
});

test('Commercial property-info migration is schema-only and customer neutral',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820002000_portal_property_info.sql');
  assertCustomerNeutral(sql,'Portal property info');
  assert.match(sql,/create table if not exists public\.customer_portal_resort_info/i);
  assert.match(sql,/booking_requests_open boolean not null default false/i);
  assert.match(sql,/public\.is_resort_admin\(\)/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.customer_portal_resort_info/i);
});

test('Commercial images migration is customer neutral and does not expose Storage listing',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820003000_portal_images_storage.sql');
  assertCustomerNeutral(sql,'Portal images');
  assert.match(sql,/create table if not exists public\.customer_portal_images/i);
  assert.match(sql,/['"]customer-portal-images['"]/i);
  assert.match(sql,/public\s*=\s*excluded\.public/i);
  assert.match(sql,/category text not null default 'general'/i);
  assert.match(sql,/char_length\(category\) between 1 and 80/i);
  assert.match(sql,/public reads visible customer portal images/i);
  assert.match(sql,/admins upload customer portal image files/i);
  assert.match(sql,/bucket_id = 'customer-portal-images'[\s\S]*public\.is_resort_admin\(\)/i);
  assert.match(sql,/drop policy if exists "public reads customer portal image files"[\s\S]*on storage\.objects/i);
  assert.doesNotMatch(sql,/create policy "public reads customer portal image files"/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.customer_portal_images/i);
});

test('Commercial migration documentation explicitly excludes legacy Staging migrations from customer install',async()=>{
  const doc=await read('supabase/commercial/README.md');
  assert.match(doc,/20260818135222_staging_app_state\.sql/);
  assert.match(doc,/20260818141102_optimize_app_state_rls\.sql/);
  assert.match(doc,/20260731090000_customer_portal_resort_info\.sql/);
  assert.match(doc,/20260820003000_portal_images_storage\.sql/);
  assert.match(doc,/لا تدخل في Commercial Install/);
  assert.match(doc,/يمنع حفظ Service Role Key/);
});
