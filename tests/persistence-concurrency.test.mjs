import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/persistence-harness.mjs';
test('never-settling write and read release caller and queued saves without blind writes',async()=>{
 const {c,control}=harness(undefined,{deadline:20});control.delay=new Promise(()=>{});control.hangRead=true;
 await assert.rejects(c.persist(),e=>e.code==='ADWAA_SAVE_TIMEOUT');
 assert.equal(c.__adwaaLastPersistResult.outcome,'unknown');
 await assert.rejects(c.persist(),e=>e.code==='ADWAA_SAVE_TIMEOUT');
 assert.equal(control.writes,1);
});
test('commit followed by hung response is read back and confirmed once',async()=>{
 const {c,control}=harness(undefined,{deadline:20});
 // The server commits, but transport never returns its acknowledgement.
 let settle;const gate=new Promise(r=>settle=r);
 const original=c.supabaseClient.from;
 c.supabaseClient.from=()=>{const q=original();const get=q.maybeSingle;q.maybeSingle=async()=>{const result=await get();if(control.writes&&control.reads===0)await gate;return result};return q};
 assert.equal(await c.persist(),true);assert.equal(control.commits,1);settle();
});
test('two devices with the same version cannot overwrite each other',async()=>{
 const first=harness();const second=harness(first.shared);second.c.db.bookings[0].total=1500;
 const results=await Promise.allSettled([first.c.persist(),second.c.persist()]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='ADWAA_CONFLICT').length,1);
 assert.equal(first.control.commits+second.control.commits,1);
 assert.equal(second.c.db.bookings[0].total,1500);
});
test('late timed-out write cannot overwrite a newer retry',async()=>{
 const {c,control,shared}=harness(undefined,{deadline:20});let release;control.delay=new Promise(r=>release=r);
 await assert.rejects(c.persist());control.delay=null;c.db.bookings[0].total=1600;
 assert.equal(await c.persist(),true);release();await new Promise(r=>setImmediate(r));
 assert.equal(shared.row.data.bookings[0].total,1600);assert.equal(control.commits,1);
});
test('stale restore is rejected using the same version predicate',async()=>{
 const first=harness();const second=harness(first.shared);await first.c.persist();
 await assert.rejects(second.c.AdwaaPersistence.persist({bookings:[],seq:2}),e=>e.code==='ADWAA_CONFLICT');
 assert.equal(first.shared.row.data.bookings.length,1);
});
test('missing record or denied select never creates or upserts a system row',async()=>{
 const {c,control,shared}=harness();shared.row=null;
 await assert.rejects(c.persist(),e=>e.code==='ADWAA_CONFLICT');assert.equal(control.commits,0);
});

test('logout aborts a hanging save and cannot overwrite a new session result',async()=>{
 const {c,control}=harness(undefined,{deadline:1000});control.delay=new Promise(()=>{});
 const pending=c.persist();await new Promise(r=>setImmediate(r));
 c.AdwaaPersistence.reset();c.currentUser=null;
 await assert.rejects(pending,e=>e.code==='ADWAA_SESSION_CLOSED');
 assert.equal(c.__adwaaLastPersistResult,undefined);assert.equal(control.commits,0);
});
test('a backwards client clock still produces a strictly newer revision',async()=>{
 const shared={row:{id:'main',data:{bookings:[],seq:1},updated_at:'2099-01-01T00:00:00.000Z'}};
 const {c}=harness(shared);await c.persist();assert.ok(Date.parse(shared.row.updated_at)>Date.parse('2099-01-01T00:00:00.000Z'));
});
