import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const core=await readFile(path.join(root,'supabase/commercial/core/migrations/20260820002000_core_function_grants.sql'),'utf8');
const portal=await readFile(path.join(root,'supabase/commercial/portal/migrations/20260820010000_portal_function_grants.sql'),'utf8');
const worker=await readFile(path.join(root,'supabase/commercial/portal/migrations/20260820009000_portal_worker_checks.sql'),'utf8');
const finalFeatures=await readFile(path.join(root,'supabase/commercial/portal/migrations/20260820008000_portal_final_features.sql'),'utf8');

test('Core admin helper explicitly denies anonymous execution',()=>{
  assert.match(core,/revoke execute on function public\.is_commercial_admin\(\) from public, anon;/i);
  assert.match(core,/grant execute on function public\.is_commercial_admin\(\) to authenticated;/i);
});

test('Portal manager-only RPCs explicitly deny anonymous execution',()=>{
  assert.match(portal,/revoke execute on function public\.is_resort_admin\(\) from public, anon;/i);
  assert.match(portal,/revoke execute on function public\.create_customer_portal_worker_check\(text,text,date,text,text\) from public, anon;/i);
  assert.match(portal,/grant execute on function public\.create_customer_portal_worker_check\(text,text,date,text,text\) to authenticated;/i);
});

test('Token-bounded public portal RPCs remain intentionally callable by visitors',()=>{
  assert.match(worker,/grant execute on function public\.get_customer_portal_worker_check\(text\) to anon, authenticated;/i);
  assert.match(worker,/grant execute on function public\.finalize_customer_portal_worker_check\(text,text\[\],text\[\],text\) to anon, authenticated;/i);
  assert.match(finalFeatures,/grant execute on function public\.begin_customer_portal_feedback\(text,text,text,text,text\) to anon, authenticated;/i);
  assert.match(finalFeatures,/grant execute on function public\.finalize_customer_portal_feedback\(uuid,text,text\[\]\) to anon, authenticated;/i);
  assert.match(finalFeatures,/grant execute on function public\.increment_customer_portal_visitor\(text\) to anon, authenticated;/i);
});
