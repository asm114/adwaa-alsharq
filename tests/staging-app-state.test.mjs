import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const productionRef='pgdvlklpyrvmwzitsmbw';

test('Migration تنشئ app_state فقط دون إدخال أو نقل بيانات',async()=>{
  const sql=await read('supabase/migrations/20260818135222_staging_app_state.sql');
  assert.match(sql,/create table if not exists public\.app_state\s*\([\s\S]*id text not null primary key[\s\S]*data jsonb not null default '\{\}'::jsonb[\s\S]*updated_at timestamptz not null default now\(\)/i);
  assert.match(sql,/alter table public\.app_state enable row level security/i);
  assert.doesNotMatch(sql,/\binsert\s+into\b|\bupdate\s+public\.app_state\s+set\b|\bdelete\s+from\b|\btruncate\s+(?:table\s+)?public\.app_state\b/i);
  for(const table of ['reservations','customers','payments','reservation_financials'])assert.doesNotMatch(sql,new RegExp(`public\\.${table}\\b`,'i'));
});

test('RLS تقصر SELECT وINSERT وUPDATE على بريد المدير المصادق عليه',async()=>{
  const sql=await read('supabase/migrations/20260818135222_staging_app_state.sql');
  const predicate="lower(coalesce(auth.jwt() ->> 'email', '')) = lower('asm114@hotmail.com')";
  assert.match(sql,/create policy manager_select_app_state[\s\S]*for select[\s\S]*to authenticated[\s\S]*using/i);
  assert.match(sql,/create policy manager_insert_app_state[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check/i);
  assert.match(sql,/create policy manager_update_app_state[\s\S]*for update[\s\S]*to authenticated[\s\S]*using[\s\S]*with check/i);
  assert.equal(sql.split(predicate).length-1,4);
  assert.match(sql,/revoke all privileges on table public\.app_state from anon/i);
  assert.match(sql,/grant select, insert, update on table public\.app_state to authenticated/i);
  assert.doesNotMatch(sql,/for delete/i);
});

test('Migration التحسين تعيد إنشاء سياسات app_state مع تهيئة JWT مرة واحدة',async()=>{
  const sql=await read('supabase/migrations/20260818141102_optimize_app_state_rls.sql');
  const predicate="lower(coalesce((select auth.jwt()) ->> 'email', ''))";
  for(const [policy,command] of [
    ['manager_select_app_state','select'],
    ['manager_insert_app_state','insert'],
    ['manager_update_app_state','update']
  ]){
    assert.match(sql,new RegExp(`drop policy if exists ${policy}`,'i'));
    assert.match(sql,new RegExp(`create policy ${policy}[\\s\\S]*for ${command}[\\s\\S]*to authenticated`,'i'));
  }
  assert.equal(sql.split(predicate).length-1,4);
  assert.match(sql,/manager_select_app_state[\s\S]*using/i);
  assert.match(sql,/manager_insert_app_state[\s\S]*with check/i);
  assert.match(sql,/manager_update_app_state[\s\S]*using[\s\S]*with check/i);
  assert.doesNotMatch(sql,/\binsert\s+into\b|\bupdate\s+public\.app_state\s+set\b|\bdelete\s+from\b|\btruncate\b/i);
});

test('إضافة Realtime لا تتكرر إذا كان الجدول موجودًا في publication',async()=>{
  const sql=await read('supabase/migrations/20260818135222_staging_app_state.sql');
  assert.match(sql,/pg_catalog\.pg_publication_tables[\s\S]*pubname = 'supabase_realtime'[\s\S]*schemaname = 'public'[\s\S]*tablename = 'app_state'/i);
  assert.match(sql,/if not exists[\s\S]*alter publication supabase_realtime add table public\.app_state/i);
});

test('إعداد النسخة التجارية يرفض Core Project غير المطابق لإعداد العميل',async()=>{
  const source=await read('supabase-config.staging.js');
  const configured=source
    .replace('CHANGE_ME_DEPLOYMENT_ID','customer-alpha')
    .replace('CHANGE_ME_BASE_PATH','customer-alpha')
    .replace('CHANGE_ME_STORAGE_NAMESPACE','customer-alpha-storage')
    .replace('CHANGE_ME_AUTH_NAMESPACE','customer-alpha-auth')
    .replace('CHANGE_ME_CACHE_NAMESPACE','customer-alpha-cache')
    .replace('CHANGE_ME_BRAND_NAME','Customer Alpha')
    .replace('CHANGE_ME_BUSINESS_TYPE','Resort')
    .replace('CHANGE_ME_LOCATION','Customer Location')
    .replace('CHANGE_ME_BRAND_DESCRIPTION','Customer Alpha commercial installation')
    .replace('CHANGE_ME_AUTHORIZED_CUSTOMER','Customer Alpha')
    .replace('CHANGE_ME_CLIENT_ID','CLIENT-TEST-0001')
    .replace('CHANGE_ME_CORE_PROJECT_REF','clientcore12345')
    .replace('CHANGE_ME_CORE_PUBLISHABLE_KEY','sb_publishable_test_core')
    .replace('CHANGE_ME_PORTAL_PROJECT_REF','clientportal12345')
    .replace('CHANGE_ME_PORTAL_PUBLISHABLE_KEY','sb_publishable_test_portal');
  const context={window:{},URL};
  vm.runInNewContext(configured,context);
  assert.equal(context.window.ADWAA_SUPABASE_CONFIG.environment,'production');
  assert.equal(context.window.ADWAA_SUPABASE_CONFIG.projectRef,'clientcore12345');
  assert.equal(context.window.ADWAA_PORTAL_SUPABASE_CONFIG.projectRef,'clientportal12345');
  assert.equal(context.window.ADWAA_COMMERCIAL_CONFIG.brand.displayName,'Resort Customer Alpha');
  assert.throws(()=>context.window.__adwaaValidateStagingSupabaseConfig({
    environment:'production',
    url:'https://othercore12345.supabase.co',
    publishableKey:'sb_publishable_test'
  }),/غير مطابقة/);
  assert.throws(()=>context.window.__adwaaValidateStagingSupabaseConfig({
    environment:'production',
    url:'https://clientportal12345.supabase.co',
    publishableKey:'sb_publishable_test'
  }),/غير مطابقة/);
});

test('التطبيق وعميل البوابة يستخدمان إعداد Supabase المركزي قبل إنشاء العملاء',async()=>{
  const [html,portal,worker]=await Promise.all([read('index.html'),read('portal-admin-client.js'),read('sw.js')]);
  assert.match(html,/supabase-config\.staging\.js[\s\S]*supabase-js@2/);
  assert.match(html,/window\.ADWAA_SUPABASE_CONFIG/);
  assert.doesNotMatch(html,new RegExp(`https://${productionRef}\\.supabase\\.co`));
  assert.match(portal,/portalSupabaseConfig=window\.ADWAA_SUPABASE_CONFIG/);
  assert.doesNotMatch(portal,/const PORTAL_SUPABASE_URL='https:\/\//);
  assert.match(worker,/supabase-config\.staging\.js/);
});
