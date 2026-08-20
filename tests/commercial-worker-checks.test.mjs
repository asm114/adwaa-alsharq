import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const migrationPath='supabase/commercial/portal/migrations/20260820009000_portal_worker_checks.sql';

const forbiddenIdentity=[
  /أضواء الشرق/,
  /القاع البارد/,
  /adwaa[_ -]?al[_ -]?sharq/i,
  /[A-Z0-9._%+-]+@(hotmail|gmail|outlook)\.[A-Z]{2,}/i,
  /https?:\/\/[a-z0-9-]+\.supabase\.co/i
];

function assertCustomerNeutral(source,label){
  for(const pattern of forbiddenIdentity){
    assert.doesNotMatch(source,pattern,`${label} must not contain customer/developer identity: ${pattern}`);
  }
}

test('Commercial worker-check migration is customer-neutral and complete for Fresh Install',async()=>{
  const sql=await read(migrationPath);
  assertCustomerNeutral(sql,'Commercial worker checks');
  assert.match(sql,/create table if not exists public\.customer_portal_worker_checks/i);
  assert.match(sql,/create_customer_portal_worker_check/i);
  assert.match(sql,/get_customer_portal_worker_check/i);
  assert.match(sql,/finalize_customer_portal_worker_check/i);
  assert.match(sql,/private\.can_upload_customer_portal_worker_check/i);
  assert.match(sql,/customer-portal-worker-checks/i);
  assert.match(sql,/false,\s*8388608,/i);
  assert.match(sql,/alter publication supabase_realtime add table public\.customer_portal_worker_checks/i);
});

test('Worker-check RLS and Storage remain private and admin deletion is included from first install',async()=>{
  const sql=await read(migrationPath);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.customer_portal_worker_checks from public, anon, authenticated/i);
  assert.match(sql,/create policy "admins read worker checks"/i);
  assert.match(sql,/create policy "admins update worker checks"/i);
  assert.match(sql,/create policy "admins delete worker checks"/i);
  assert.match(sql,/using \(public\.is_resort_admin\(\)\)/i);
  assert.match(sql,/create policy "worker uploads worker check media"/i);
  assert.match(sql,/create policy "worker cleans pending worker check media"/i);
  assert.match(sql,/create policy "admins read worker check media"/i);
  assert.match(sql,/create policy "admins delete worker check media"/i);
  assert.doesNotMatch(sql,/create policy[^\n]*public[^\n]*read worker check media/i);
});

test('Worker-check token lifetime follows the current token issuance, including rotations',async()=>{
  const sql=await read(migrationPath);
  assert.match(sql,/token_issued_at timestamptz not null default now\(\)/i);
  assert.match(sql,/access_token_hash = encode\([\s\S]*?token_issued_at = now\(\)/i);
  const expiryChecks=sql.match(/c\.token_issued_at >= now\(\) - interval '14 days'/gi)||[];
  assert.equal(expiryChecks.length,3,'all public/upload/finalize token gates must use token_issued_at');
  assert.doesNotMatch(sql,/c\.created_at >= now\(\) - interval '14 days'/i);
});

test('Worker-check finalization validates report choices and uploaded paths on the server',async()=>{
  const sql=await read(migrationPath);
  assert.match(sql,/cardinality\(v_photos\) < 1 or cardinality\(v_photos\) > 6/i);
  assert.match(sql,/cardinality\(v_issues\) < 1 or cardinality\(v_issues\) > 6/i);
  assert.match(sql,/'ok' = any\(v_issues\) and cardinality\(v_issues\) > 1/i);
  assert.match(sql,/v_path not like v_id::text \|\| '\/' \|\| p_access_token \|\| '\/photo-%'/i);
  assert.match(sql,/v_voice not like v_id::text \|\| '\/' \|\| p_access_token \|\| '\/voice-%'/i);
  assert.match(sql,/status = 'submitted'/i);
  assert.match(sql,/token_issued_at >= now\(\) - interval '14 days'/i);
});

test('Current worker-check runtime matches the commercial migration contract',async()=>{
  const [publicJs,adminJs,deleteJs]=await Promise.all([
    read('worker-check-public.js'),
    read('worker-check-admin.js'),
    read('worker-check-delete.js')
  ]);
  assert.match(publicJs,/window\.ADWAA_PORTAL_SUPABASE_CONFIG/);
  assert.match(publicJs,/customer-portal-worker-checks/);
  assert.match(publicJs,/get_customer_portal_worker_check/);
  assert.match(publicJs,/finalize_customer_portal_worker_check/);
  assert.match(publicJs,/MAX_PHOTOS=6/);
  assert.match(adminJs,/create_customer_portal_worker_check/);
  assert.match(adminJs,/customer_portal_worker_checks/);
  assert.match(deleteJs,/storage\.from\(BUCKET\)\.remove\(paths\)/);
  assert.match(deleteJs,/status:'reviewed'/);
});

test('Commercial branding replaces legacy worker identity before worker-check actions',async()=>{
  const branding=await read('commercial-branding.js');
  assert.match(branding,/function syncWorkerIdentity\(\)/);
  assert.match(branding,/db\.settings\.propertyName=brand\.name/);
  assert.match(branding,/db\.settings\.propertyType=brand\.businessType/);
  assert.match(branding,/function scheduleBranding\(\)\{syncWorkerIdentity\(\);queueMicrotask\(applyBranding\)\}/);
  assert.match(branding,/document\.addEventListener\('click',scheduleBranding,true\)/);
});
