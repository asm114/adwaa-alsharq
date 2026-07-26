import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase-security-review.sql',import.meta.url),'utf8');
const cleaner=readFileSync(new URL('../cleaner.html',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const validation=readFileSync(new URL('../security-validation.js',import.meta.url),'utf8');
const ownerExample=readFileSync(new URL('../supabase-set-staging-owner.sql.example',import.meta.url),'utf8');
const rls=readFileSync(new URL('../sql/staging/04-rls-and-policies.sql',import.meta.url),'utf8');

assert.match(sql,/p_expected_revision bigint/i);
assert.match(sql,/v_revision <> p_expected_revision/i);
assert.match(sql,/errcode='40001',message='conflict'/i);
assert.match(sql,/'revision',v_revision\+1/i);
assert.match(sql,/'revision',v_revision/i);
assert.match(sql,/p_expected_revision is null or p_expected_revision < 0/i);
assert.match(cleaner,/p_expected_revision:expectedRevision/);
assert.match(cleaner,/تم تحديث المهمة من جهاز آخر\. أُعيد تحميل أحدث نسخة\./);
assert.match(index,/revision:0/);
assert.match(validation,/'revision'/);

function update(task,expected,patch){
  if(!Number.isSafeInteger(expected)||expected<0)throw new Error('invalid_request');
  if(task.revision!==expected)throw new Error('conflict');
  const allowed=new Set(['status','photos','issues','arrivedAt','handedOverAt','departedAt','startedAt','completedAt']);
  if(Object.keys(patch).some(key=>!allowed.has(key)))throw new Error('invalid_request');
  return {...task,...patch,revision:task.revision+1};
}

const initial={id:'task',revision:0,status:'pending'};
const first=update(initial,0,{status:'arrived'});
assert.equal(first.revision,1);
assert.throws(()=>update(first,0,{status:'departed'}),/conflict/);
const retry=update(first,1,{status:'departed'});
assert.equal(retry.revision,2);
assert.throws(()=>update(initial,-1,{status:'arrived'}),/invalid_request/);
assert.throws(()=>update(initial,Number.NaN,{status:'arrived'}),/invalid_request/);
assert.throws(()=>update(initial,0,{bookingId:'other'}),/invalid_request/);
assert.throws(()=>update(initial,0,{expenses:[]}),/invalid_request/);

assert.match(sql,/where k not in \('id','place','phase','time','dataUrl','uploadedBy'\)/i);
assert.match(sql,/where k not in \('id','types','place','phase','time','photoDataUrl'\)/i);
assert.match(sql,/jsonb_array_length\(p_items\) > 20/i);
assert.match(sql,/length\(v_url\) > 1000000/i);
assert.match(sql,/length\(v_photo\) > 1000000/i);
assert.match(sql,/\^data:image\/\(png\|jpeg\|webp\);base64/i);
assert.doesNotMatch(sql,/\^data:image\/[^']*svg/i);
assert.doesNotMatch(sql,/data:text\/html/i);
assert.doesNotMatch(sql,/javascript:/i);
assert.match(sql,/v_booking_id := v_task->>'bookingId'/i);
assert.doesNotMatch(sql,/p_patch->>'bookingId'/i);
assert.match(sql,/select jsonb_build_object\(\s*'id',value->>'id','dataUrl'/i);

assert.match(rls,/preflight_failed_main_missing/);
assert.match(rls,/preflight_failed_owner_missing/);
assert.match(rls,/preflight_failed_owner_invalid/);
assert.match(ownerExample,/<STAGING_MANAGER_USER_UUID>/);
assert.match(ownerExample,/replace_staging_manager_uuid_first/);
assert.match(sql,/set search_path = pg_catalog, public, pg_temp/i);
assert.match(sql,/set search_path = pg_catalog, pg_temp/i);
assert.match(sql,/revoke all on function public\.cleaner_get_task\(uuid,text\) from public/i);
assert.match(sql,/revoke all on function public\.cleaner_update_task\(uuid,text,bigint,jsonb\) from public/i);
assert.doesNotMatch(sql,/grant execute on function[^;]+ to public/i);

console.log('cleaner-occ-security: optimistic concurrency and RPC allowlists passed');

