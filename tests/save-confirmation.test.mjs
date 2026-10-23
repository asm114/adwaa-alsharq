import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../booking-persist-update-path.js',import.meta.url),'utf8');
function harness(){
 const state={bookings:[{id:'b1',total:1200,paid:500,payments:[{id:'p1',amount:500}]}],seq:2};
 const control={writes:0,reads:0,remote:null,writeError:false,commit:true,readError:false,delay:null,hashError:false,hashWait:false,status:[]};
 const c={db:state,currentUser:{id:'test'},persist:async()=>{},normalizeDB:x=>x,invalidateCaches(){},localStorage:{setItem(){}},scheduleRenderAll(){},alert(){},showLogin(){},STATE_ROW_ID:'main',remoteReady:false,lastSuccessfulWriteAt:'',lastSyncError:'',lastConfirmedRemoteHash:'',renderDataProtectionSyncStatus:async()=>{},setSyncStatus:(...x)=>control.status.push(x),console:{warn(){},error(){}},markRemoteStateConfirmed:async()=>{if(control.hashWait)await new Promise(()=>{});if(control.hashError)throw Error('hash unavailable')}};
 c.window=c;
 c.supabaseClient={from(){let payload;const q={update(p){payload=p;return q},upsert(p){payload=p;return q},eq(){return q},select(){return q},async maybeSingle(){if(payload){control.writes++;if(control.delay)await control.delay;if(control.commit)control.remote=structuredClone(payload.data);if(control.writeError)throw Error('lost response');return {data:{id:'main'},error:null}}control.reads++;if(control.readError)throw Error('offline');return {data:control.remote?{data:control.remote}:null,error:null}}};return q}};
 vm.runInNewContext(source,c);return {c,control};
}
test('acknowledged write remains successful when confirmation hash fails',async()=>{
 const {c,control}=harness();control.hashError=true;
 assert.equal(await c.persist(),true);assert.equal(control.writes,1);assert.equal(c.__adwaaLastPersistResult.ok,true);assert.equal(c.remoteReady,true);
});
test('hash that never resolves does not hold the save open',async()=>{
 const {c,control}=harness();control.hashWait=true;
 let timer;
 try{assert.equal(await Promise.race([c.persist(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('save remained pending')),100)})]),true)}finally{clearTimeout(timer)}
});
test('lost response is reconciled by full snapshot including payments without another write',async()=>{
 const {c,control}=harness();control.writeError=true;
 assert.equal(await c.persist(),true);assert.equal(control.reads,1);assert.equal(control.writes,1);assert.equal(c.__adwaaLastPersistResult.mode,'reconciled');
 assert.deepEqual(control.remote.bookings[0].payments,[{id:'p1',amount:500}]);
});
test('unknown outcome never announces success; recovery reads before rewriting',async()=>{
 const {c,control}=harness();control.writeError=true;control.readError=true;
 await assert.rejects(c.persist());assert.equal(c.__adwaaLastPersistResult.outcome,'unknown');
 control.readError=false;
 assert.equal(await c.persist(),true);assert.equal(control.writes,1);assert.equal(control.reads,2);
});
test('offline, unconfirmed write preserves input and prevents blind retry',async()=>{
 const {c,control}=harness();control.writeError=true;control.commit=false;control.readError=true;
 await assert.rejects(c.persist());await assert.rejects(c.persist());
 assert.equal(control.writes,1);assert.equal(c.db.bookings[0].total,1200);assert.equal(c.__adwaaLastPersistResult.ok,false);
});
test('slow saves write immutable snapshots in order',async()=>{
 const {c,control}=harness();let release;control.delay=new Promise(r=>release=r);
 const first=c.persist();c.db.bookings[0].total=1400;const second=c.persist();
 await new Promise(r=>setImmediate(r));assert.equal(control.writes,1);assert.equal(c.__adwaaLastPersistResult,undefined);
 release();await Promise.all([first,second]);assert.equal(control.writes,2);assert.equal(control.remote.bookings[0].total,1400);
});
test('readback mismatch in money never confirms the attempted save',async()=>{
 const {c,control}=harness();control.remote=structuredClone(c.db);control.remote.bookings[0].paid=200;control.writeError=true;control.commit=false;
 await assert.rejects(c.persist());assert.equal(c.__adwaaLastPersistResult.ok,false);
});

test('retry after a negative read keeps stable financial operation IDs',async()=>{
 const {c,control}=harness();control.writeError=true;control.commit=false;
 await assert.rejects(c.persist());
 control.writeError=false;control.commit=true;
 assert.equal(await c.persist(),true);
 assert.equal(control.writes,2);assert.equal(control.reads,2);
 assert.equal(control.remote.bookings[0].payments.length,1);
 assert.equal(control.remote.bookings[0].payments[0].id,'p1');
});
