import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './helpers/persistence-harness.mjs';
const original=readFileSync(new URL('../booking-persist-update-path.js',import.meta.url),'utf8');
const patch=readFileSync(new URL('../docs/maintenance-server-guard-client.patch',import.meta.url),'utf8');
const lines=patch.split('\n');
assert.deepEqual(lines.filter(x=>x.startsWith('--- ')||x.startsWith('+++ ')),['--- a/booking-persist-update-path.js','+++ b/booking-persist-update-path.js']);
assert.equal(lines.filter(x=>x.startsWith('@@')).length,1);
const hunk=lines.slice(lines.findIndex(x=>x.startsWith('@@'))+1);
const before=hunk.filter(x=>x.startsWith(' ')||x.startsWith('-')).map(x=>x.slice(1)).join('\n')+'\n';
const after=hunk.filter(x=>x.startsWith(' ')||x.startsWith('+')).map(x=>x.slice(1)).join('\n')+'\n';
assert.ok(original.includes(before));assert.equal(original.indexOf(before),original.lastIndexOf(before));
const candidate=original.replace(before,after);
test('approval-only client patch replaces the primitive and confirms one RPC write',async()=>{
 const {c,control,shared}=harness(undefined,{source:candidate,rpc:true});
 assert.equal(await c.persist(),true);assert.equal(control.commits,1);assert.equal(shared.row.data.bookings[0].paid,500);
});
test('approval-only RPC client keeps one winner for two devices',async()=>{
 const first=harness(undefined,{source:candidate,rpc:true}),second=harness(first.shared,{source:candidate,rpc:true});second.c.db.bookings[0].total=1600;
 const out=await Promise.allSettled([first.c.persist(),second.c.persist()]);
 assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal(first.control.commits+second.control.commits,1);
 assert.ok(out.some(x=>x.status==='rejected'&&x.reason.code==='ADWAA_CONFLICT'));
});
test('approval-only RPC client reconciles a lost response without a second operation',async()=>{
 const {c,control}=harness(undefined,{source:candidate,rpc:true});control.writeError=true;
 assert.equal(await c.persist(),true);assert.equal(control.commits,1);assert.equal(control.writes,1);assert.equal(control.reads,1);
});

const guardSql=readFileSync(new URL('../docs/maintenance-server-guard-proposal.sql',import.meta.url),'utf8');
const rollbackSql=readFileSync(new URL('../docs/maintenance-server-guard-rollback.sql',import.meta.url),'utf8');
test('guard proposal removes every direct browser mutation privilege and leaves SELECT available',()=>{
 assert.match(guardSql,/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.app_state FROM PUBLIC, anon, authenticated;/);
 assert.match(guardSql,/REVOKE ALL ON FUNCTION public\.adwaa_cas_write_app_state_v1\(timestamptz,jsonb\) FROM PUBLIC, anon;/);
 assert.match(guardSql,/GRANT EXECUTE ON FUNCTION public\.adwaa_cas_write_app_state_v1\(timestamptz,jsonb\) TO authenticated;/);
 assert.doesNotMatch(guardSql,/\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.app_state)\b/i);
});
test('emergency rollback documents restoring inspected privileges without touching financial rows',()=>{
 assert.match(rollbackSql,/GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.app_state TO authenticated;/);
 assert.doesNotMatch(rollbackSql,/\b(?:UPDATE public\.app_state|DELETE FROM public\.app_state|TRUNCATE TABLE)\b/i);
});
