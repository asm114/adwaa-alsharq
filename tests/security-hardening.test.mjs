import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const indexSource=await read('index.html');

test('main administration script remains syntactically valid',()=>{
  const match=indexSource.match(/<script>\s*(const \{url:SUPABASE_URL[\s\S]*?)<\/script>/);
  assert.ok(match,'main inline script must be found');
  assert.doesNotThrow(()=>Function(match[1]));
});

test('backup validation rejects executable markup, unsafe identifiers, and unsafe image URLs',()=>{
  const start=indexSource.indexOf('const BACKUP_MAX_FILE_BYTES=');
  const end=indexSource.indexOf('function backupCoreData()',start);
  assert.ok(start>0&&end>start,'backup validation helper block must exist');
  const helpers=Function(`${indexSource.slice(start,end)};return {assertSafeBackupValue,isSafeBackupImageDataUrl};`)();
  assert.doesNotThrow(()=>helpers.assertSafeBackupValue({bookings:[{id:'550e8400-e29b-41d4-a716-446655440000',name:'عميل آمن',photos:[{dataUrl:'data:image/png;base64,AA=='}]}]}));
  assert.throws(()=>helpers.assertSafeBackupValue({bookings:[{name:'<img src=x onerror=alert(1)>'}]}),/HTML/);
  assert.throws(()=>helpers.assertSafeBackupValue({bookings:[{id:"x' onclick='alert(1)"}]}),/معرّف/);
  assert.throws(()=>helpers.assertSafeBackupValue({bookings:[{photos:[{dataUrl:'javascript:alert(1)'}]}]}),/صورة/);
  assert.equal(helpers.isSafeBackupImageDataUrl('data:image/webp;base64,AA=='),true);
});

test('backup envelope and file size are constrained before restore',()=>{
  assert.match(indexSource,/BACKUP_MAX_FILE_BYTES=25\*1024\*1024/);
  assert.match(indexSource,/envelope\.recoveryId!==undefined&&!BACKUP_RECOVERY_ID\.test/);
  assert.match(indexSource,/file\.size>BACKUP_MAX_FILE_BYTES/);
  assert.match(indexSource,/assertSafeBackupValue\(data\)/);
});

test('manager cache is authorized before rendering and cleared on logout',()=>{
  const showStart=indexSource.indexOf('async function showApplication(user)');
  const showEnd=indexSource.indexOf('async function loginManager',showStart);
  const show=indexSource.slice(showStart,showEnd);
  assert.ok(show.indexOf('await loadRemoteData({render:false})')<show.indexOf("classList.remove('auth-locked')"));
  assert.ok(show.indexOf('await loadRemoteData({render:false})')<show.indexOf('renderAll()'));
  assert.match(show,/ownerMatches[\s\S]*!authorized&&\(!ownerMatches\|\|lastRemoteLoadDenied\)/);
  assert.match(indexSource,/function clearSensitiveLocalState\(\)[\s\S]*localStorage\.removeItem\('adwaaDB'\)[\s\S]*localStorage\.removeItem\(MANAGER_CACHE_OWNER_KEY\)[\s\S]*db=createEmptyDB\(\)/);
  assert.match(indexSource,/localStorage\.setItem\(MANAGER_CACHE_OWNER_KEY,String\(currentUser\.id\)\)/);
  assert.match(indexSource,/lastRemoteLoadDenied=denied/);
  assert.match(indexSource,/async function logoutManager\(\)[\s\S]*showLogin\(\);\s*clearSensitiveLocalState\(\)/);
});

test('CSV values neutralize spreadsheet formula prefixes without changing ordinary text',()=>{
  const declaration=indexSource.match(/function csvSafeCell\(value\)\{[^\n]+\}/)?.[0];
  assert.ok(declaration);
  const csvSafeCell=Function(`${declaration};return csvSafeCell;`)();
  for(const value of ['=1+1','+cmd','-10+20','@SUM(A1:A2)','  =HYPERLINK("https://example.test")'])assert.ok(csvSafeCell(value).startsWith("'"));
  assert.equal(csvSafeCell('عميل عادي'),'عميل عادي');
  assert.equal(csvSafeCell(125), '125');
  assert.match(indexSource,/csvSafeCell\(v\)\.replaceAll/);
});

test('generated document JavaScript escapes script-ending characters',async()=>{
  for(const path of ['document-preview-controls.js','generated-document-toolbar.js']){
    const source=await read(path);
    const declaration=source.match(/function escJs\(value\)\{[^\n]+\}/)?.[0];
    assert.ok(declaration,`${path} must define escJs`);
    const escJs=Function(`${declaration};return escJs;`)();
    const encoded=escJs('</script><script>alert(1)</script>');
    assert.doesNotMatch(encoded,/<\/script>/i);
    assert.match(encoded,/\\u003c/);
  }
});

test('Supabase browser dependency is pinned to the reviewed exact release',async()=>{
  const paths=['index.html','cleaner.html','resort/index.html','resort/feedback.html','resort/preview.html','backup-before-v9.5-RC1-2026-07-22.html','index-v9.0-before-RC1.html'];
  for(const path of paths){
    const source=await read(path);
    assert.match(source,/@supabase\/supabase-js@2\.111\.0/);
    assert.doesNotMatch(source,/@supabase\/supabase-js@2["/]/);
    assert.match(source,/integrity="sha384-fPWur1rx\/DE6YtXP\/x0MD6dd90RgnVsz5yX\/DIg7CcVAnTBZsENWuIcpvVTM39ti"/);
    assert.match(source,/crossorigin="anonymous"/);
  }
});

test('public unavailable-period view excludes booking ownership metadata',async()=>{
  const migration=await read('supabase/migrations/20260822142401_secure_public_unavailable_periods_view.sql');
  const portal=await read('resort/portal.js');
  assert.match(migration,/customer_portal_unavailable_periods_public/);
  assert.match(migration,/security_invoker\s*=\s*true/i);
  assert.match(migration,/select\s+start_date,\s*end_date\s+from public\.customer_portal_unavailable_periods/i);
  assert.match(migration,/revoke select\s+on public\.customer_portal_unavailable_periods\s+from anon, authenticated/i);
  assert.match(migration,/grant select \(start_date, end_date\)\s+on public\.customer_portal_unavailable_periods\s+to anon/i);
  assert.match(migration,/admins read unavailable period internals[\s\S]*to authenticated[\s\S]*public\.is_resort_admin\(\)/i);
  assert.doesNotMatch(migration,/select\s+[^;]*(booking_id|source_type)[^;]*\s+from public\.customer_portal_unavailable_periods/i);
  assert.match(portal,/\.from\('customer_portal_unavailable_periods_public'\)\s*\.select\('start_date,end_date'\)/);
  assert.doesNotMatch(portal,/\.from\('customer_portal_unavailable_periods'\)\s*\.select\('id,start_date,end_date'\)/);
});

test('feedback V2 foundation is additive, service-only, and limits tickets to five slots',async()=>{
  const migration=await read('supabase/migrations/20260822143622_customer_portal_feedback_security_v2_foundation.sql');
  const legacyClient=await read('resort/feedback.js');

  assert.match(migration,/does NOT revoke the legacy feedback RPCs/i);
  assert.match(migration,/public\.customer_portal_admins/);
  assert.match(migration,/public\.is_resort_admin\(\)/);
  assert.match(migration,/create table private\.customer_portal_feedback_upload_slots/i);
  assert.match(migration,/slot_no smallint not null check \(slot_no between 1 and 5\)/i);
  assert.match(migration,/cardinality\(coalesce\(p_content_types,[\s\S]*> 5/i);
  assert.match(migration,/p_turnstile_verified is distinct from true/i);
  assert.match(migration,/create or replace function public\.begin_customer_portal_feedback_v2/i);
  assert.match(migration,/create or replace function public\.finalize_customer_portal_feedback_v2/i);
  assert.match(migration,/grant execute on function public\.begin_customer_portal_feedback_v2[\s\S]*to service_role/i);
  assert.match(migration,/revoke all on function public\.begin_customer_portal_feedback_v2[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration,/revoke[^;]*begin_customer_portal_feedback\(text,text,text,text,text\)/i);
  assert.doesNotMatch(migration,/drop policy[^;]*(visitors upload|visitors clean)/i);
  assert.match(legacyClient,/begin_customer_portal_feedback/);
  assert.match(legacyClient,/finalize_customer_portal_feedback/);
  assert.doesNotMatch(legacyClient,/begin_customer_portal_feedback_v2|customer-portal-feedback-ticket/);
});

test('feedback V2 rate limits are shadowed at browser, IP, and staging-global levels',async()=>{
  const migration=await read('supabase/migrations/20260822143622_customer_portal_feedback_security_v2_foundation.sql');
  const hardening=await read('supabase/migrations/20260822150037_harden_feedback_v2_rolling_limits_cleanup_claims.sql');
  const bounded=await read('supabase/migrations/20260822151036_bound_feedback_v2_rate_event_growth.sql');

  for(const expected of [
    /'browser_hour', 'browser', 3600, 3, true, true/,
    /'browser_day', 'browser', 86400, 10, true, true/,
    /'ip_hour', 'ip', 3600, 20, true, true/,
    /'ip_day', 'ip', 86400, 100, true, true/,
    /'global_hour', 'global', 3600, 100, true, true/
  ]) assert.match(migration,expected);

  assert.match(migration,/subject_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(hardening,/create table private\.customer_portal_feedback_rate_limit_events/i);
  assert.match(bounded,/pg_advisory_xact_lock/i);
  assert.match(bounded,/event\.occurred_at > statement_timestamp\(\)[\s\S]*make_interval\(secs => v_rule\.window_seconds\)/i);
  assert.match(bounded,/if v_count >= v_rule\.limit_count then[\s\S]*if not v_rule\.shadow_mode then\s+allowed := false/i);
  assert.match(bounded,/when 'global' then 0[\s\S]*when 'ip' then 1/i);
  assert.match(bounded,/if not v_global_saturated then[\s\S]*insert into private\.customer_portal_feedback_rate_limit_events/i);
  assert.ok(bounded.indexOf('select count(*) into v_count')<bounded.indexOf('insert into private.customer_portal_feedback_rate_limit_events'));
  assert.match(bounded,/prune_customer_portal_feedback_rate_limit_events_v2/i);
  assert.match(bounded,/occurred_at <= now\(\) - interval '2 days'/i);
  assert.doesNotMatch(bounded,/floor\(extract\(epoch|v_window_started_at/i);
  assert.match(migration,/Raw IP addresses must never be stored here/i);
  assert.doesNotMatch(migration+hardening+bounded,/\bip_address\b|\braw_ip\b/i);
});

test('feedback ticket Edge Function requires Turnstile and creates signed upload URLs',async()=>{
  const edge=await read('supabase/functions/customer-portal-feedback-ticket/index.ts');

  assert.match(edge,/CLOUDFLARE_TURNSTILE_SECRET/);
  assert.match(edge,/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(edge,/result\.action === TURNSTILE_ACTION/);
  assert.match(edge,/CUSTOMER_PORTAL_BROWSER_TOKEN_SECRET/);
  assert.match(edge,/CUSTOMER_PORTAL_RATE_LIMIT_PEPPER/);
  assert.match(edge,/crypto\.subtle\.sign\("HMAC"/);
  assert.match(edge,/`browser:\$\{browserIdentity\.id\}`/);
  assert.match(edge,/`ip:\$\{clientIp\}`/);
  assert.match(edge,/createSignedUploadUrl\(path\)/);
  assert.match(edge,/contentTypes\.length > 5/);
  assert.match(edge,/Origin is defense in depth only/i);
  assert.doesNotMatch(edge,/console\.(?:log|error)\([^\n]*(?:clientIp|payload\.message|payload\.contactNumber)/);
});

test('orphan cleanup starts disabled in dry-run and only deletes through Storage API',async()=>{
  const migration=await read('supabase/migrations/20260822143622_customer_portal_feedback_security_v2_foundation.sql');
  const hardening=await read('supabase/migrations/20260822150037_harden_feedback_v2_rolling_limits_cleanup_claims.sql');
  const edge=await read('supabase/functions/cleanup-customer-portal-feedback-orphans/index.ts');

  assert.match(migration,/dry_run_until timestamptz not null default now\(\) \+ interval '24 hours'/i);
  assert.match(migration,/deletion_enabled boolean not null default false/i);
  assert.match(migration,/mode <> 'dry_run' or deleted_count = 0/i);
  assert.match(migration,/feedback\.submitted[\s\S]*object\.name = any\(coalesce\(feedback\.image_paths/i);
  assert.match(migration,/pending_ticket_expired_older_than_2h/);
  assert.match(migration,/unreserved_older_than_24h/);
  assert.match(migration,/submitted_unreferenced_older_than_24h/);
  assert.match(edge,/CUSTOMER_PORTAL_CLEANUP_SECRET/);
  assert.match(edge,/prune_customer_portal_feedback_rate_limit_events_v2/);
  assert.match(edge,/const dryRun = mode\.dry_run === true \|\| mode\.deletion_enabled !== true/);
  assert.match(edge,/claim_customer_portal_feedback_orphans_v2/);
  assert.match(edge,/storage\.from\(BUCKET\)\.remove\(batch\)/);
  assert.match(hardening,/for update skip locked/i);
  assert.match(hardening,/prevent_claimed_feedback_submission_v2/i);
  assert.match(hardening,/claim\.object_path = any\(coalesce\(new\.image_paths/i);
  assert.doesNotMatch(edge,/\.from\(["']objects["']\)\.delete/);
  assert.doesNotMatch(migration+hardening,/delete\s+from\s+storage\.objects/i);
  assert.doesNotMatch(migration+hardening+edge,/pg_cron|pg_net|vault\.secrets|vault\.create_secret/i);
});
