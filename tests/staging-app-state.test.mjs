import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const productionRef='pgdvlklpyrvmwzitsmbw';
const stagingRef='ztqqdjryvecscidxxbfe';

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

test('إعداد Staging يرفض Project Ref الخاص بـProduction فعليًا',async()=>{
  const source=await read('supabase-config.staging.js');
  const context={window:{},URL};
  vm.runInNewContext(source,context);
  assert.equal(context.window.ADWAA_SUPABASE_CONFIG.environment,'staging');
  assert.equal(context.window.ADWAA_SUPABASE_CONFIG.projectRef,stagingRef);
  assert.throws(()=>context.window.__adwaaValidateStagingSupabaseConfig({
    environment:'staging',
    url:`https://${productionRef}.supabase.co`,
    publishableKey:'sb_publishable_test'
  }),/Production/);
  assert.throws(()=>context.window.__adwaaValidateStagingSupabaseConfig({
    environment:'staging',
    url:'https://wrong-project.supabase.co',
    publishableKey:'sb_publishable_test'
  }),/غير معتمد/);
});

test('Production يتفعل فقط لمسار مستودع أضواء الشرق على GitHub Pages',async()=>{
  const source=await read('supabase-config.staging.js');
  const run=(hostname,pathname)=>{
    const context={window:{location:{hostname,pathname}},URL};
    vm.runInNewContext(source,context);
    return context.window.ADWAA_SUPABASE_CONFIG;
  };

  const productionRoot=run('asm114.github.io','/adwaa-alsharq');
  assert.equal(productionRoot.runtimeEnvironment,'production');
  assert.equal(productionRoot.projectRef,productionRef);

  const productionNested=run('asm114.github.io','/adwaa-alsharq/resort/');
  assert.equal(productionNested.runtimeEnvironment,'production');
  assert.equal(productionNested.projectRef,productionRef);

  const otherRepository=run('asm114.github.io','/booking-system-demo/');
  assert.equal(otherRepository.runtimeEnvironment,'staging');
  assert.equal(otherRepository.projectRef,stagingRef);

  const localPreview=run('localhost','/adwaa-alsharq/');
  assert.equal(localPreview.runtimeEnvironment,'staging');
  assert.equal(localPreview.projectRef,stagingRef);
});

test('التطبيق وعميل البوابة يستخدمان إعداد Staging الموحد قبل إنشاء العملاء',async()=>{
  const [html,portal,worker]=await Promise.all([read('index.html'),read('portal-admin-client.js'),read('sw.js')]);
  assert.match(html,/supabase-config\.staging\.js[\s\S]*supabase-js@2/);
  assert.match(html,/window\.ADWAA_SUPABASE_CONFIG/);
  assert.doesNotMatch(html,new RegExp(`https://${productionRef}\\.supabase\\.co`));
  assert.match(portal,/portalSupabaseConfig=window\.ADWAA_SUPABASE_CONFIG/);
  assert.doesNotMatch(portal,/const PORTAL_SUPABASE_URL='https:\/\//);
  assert.match(worker,/supabase-config\.staging\.js/);
});
