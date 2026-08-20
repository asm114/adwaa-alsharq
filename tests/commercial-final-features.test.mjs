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

test('Commercial final-features migration is neutral and creates bounded visitor counting',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820008000_portal_final_features.sql');
  assertCustomerNeutral(sql,'Portal final features');
  assert.match(sql,/create table if not exists public\.customer_portal_visitor_counter/i);
  assert.match(sql,/create table if not exists private\.customer_portal_visitor_windows\s*\(\s*visitor_hash text primary key/i);
  assert.match(sql,/values \('main', 0\)/i);
  assert.match(sql,/create or replace function public\.increment_customer_portal_visitor\(p_visitor_key text\)/i);
  assert.match(sql,/extensions\.digest\(p_visitor_key, 'sha256'\)/i);
  assert.match(sql,/interval '24 hours'/i);
  assert.match(sql,/grant execute on function public\.increment_customer_portal_visitor\(text\) to anon, authenticated/i);
});

test('Commercial feedback migration uses private bounded submission RPCs and private Storage',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820008000_portal_final_features.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_feedback/i);
  assert.match(sql,/create table if not exists private\.customer_portal_feedback_rate_limits/i);
  assert.match(sql,/category in \('complaint','cleanliness','maintenance','suggestion','thanks','other'\)/i);
  assert.match(sql,/char_length\(message\) between 10 and 4000/i);
  assert.match(sql,/cardinality\(image_paths\) <= 5/i);
  assert.match(sql,/v_submission_count >= 3/i);
  assert.match(sql,/create or replace function public\.begin_customer_portal_feedback/i);
  assert.match(sql,/create or replace function public\.finalize_customer_portal_feedback/i);
  assert.match(sql,/create or replace function private\.can_upload_customer_portal_feedback/i);
  assert.match(sql,/['"]customer-portal-feedback['"]/i);
  assert.match(sql,/false,\s*5242880,/i);
  assert.match(sql,/visitors upload customer portal feedback images/i);
  assert.match(sql,/visitors clean failed customer portal feedback uploads/i);
  assert.match(sql,/admins read customer portal feedback images/i);
  assert.match(sql,/admins delete customer portal feedback images/i);
  assert.match(sql,/grant execute on function public\.begin_customer_portal_feedback[\s\S]*to anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.finalize_customer_portal_feedback[\s\S]*to anon, authenticated/i);
});

test('Commercial activity log starts with the hardened shared trigger',async()=>{
  const sql=await read('supabase/commercial/portal/migrations/20260820008000_portal_final_features.sql');
  assert.match(sql,/create table if not exists public\.customer_portal_activity_log/i);
  assert.match(sql,/customer_portal_activity_log_admin_idx/i);
  assert.match(sql,/create or replace function public\.log_customer_portal_admin_change\(\)/i);
  assert.match(sql,/v_old jsonb := case when tg_op = 'INSERT'/i);
  assert.match(sql,/v_new jsonb := case when tg_op = 'DELETE'/i);
  assert.match(sql,/feedback_status_update/i);
  assert.match(sql,/image_visibility_update/i);
  assert.match(sql,/revoke all on function public\.log_customer_portal_admin_change\(\) from public, anon, authenticated/i);
  for(const table of [
    'customer_portal_resort_info',
    'customer_portal_images',
    'customer_portal_unavailable_periods',
    'customer_portal_pricing',
    'customer_portal_seasons',
    'customer_portal_contact',
    'customer_portal_feedback'
  ])assert.match(sql,new RegExp(`'${table}'`));
});

test('Commercial feedback page reads the explicit customer backend and namespace',async()=>{
  const js=await read('resort/feedback.js');
  const html=await read('resort/feedback.html');
  assertCustomerNeutral(js,'Feedback runtime');
  assertCustomerNeutral(html,'Feedback page');
  assert.match(js,/window\.ADWAA_COMMERCIAL_CONFIG/i);
  assert.match(js,/window\.ADWAA_PORTAL_SUPABASE_CONFIG/i);
  assert.match(js,/commercialConfig\.namespace\.storage/i);
  assert.match(js,/portalSupabaseConfig\.url,portalSupabaseConfig\.publishableKey/i);
  assert.match(js,/begin_customer_portal_feedback/i);
  assert.match(js,/finalize_customer_portal_feedback/i);
  assert.match(js,/customer-portal-feedback/i);
  assert.doesNotMatch(js,/https:\/\/[a-z0-9]+\.supabase\.co/i);
  assert.doesNotMatch(js,/sb_publishable_/i);

  const configIndex=html.indexOf('../supabase-config.staging.js');
  const libraryIndex=html.indexOf('@supabase/supabase-js@2');
  const feedbackIndex=html.indexOf('feedback.js?v=');
  assert.ok(configIndex>=0&&libraryIndex>configIndex&&feedbackIndex>libraryIndex,'feedback page must load commercial config before Supabase and feedback runtime');
});

test('Current final admin runtime remains compatible with feedback and activity contracts',async()=>{
  const runtime=await read('portal-final-admin.js');
  assert.match(runtime,/customer_portal_visitor_counter/i);
  assert.match(runtime,/customer_portal_feedback/i);
  assert.match(runtime,/customer_portal_activity_log/i);
  assert.match(runtime,/status:item\.status,admin_note:item\.admin_note,updated_by:currentUser\?\.id\|\|null/i);
  assert.match(runtime,/createSignedUrls\(item\.image_paths,900\)/i);
});
