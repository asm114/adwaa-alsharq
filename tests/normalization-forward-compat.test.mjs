import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {harness} from './helpers/persistence-harness.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function normalizeDB(value){'),html.indexOf('async function dataStateHash'));
test('initial load preserves financial extension collections before their modules install',()=>{
 const state={bookings:[],expenses:[{id:'e1',amount:2200}],seq:4,maintenanceJobs:[{id:'m1',totalAmount:3000,payments:[{id:'p1',amount:2200}]}],installmentPurchases:[{id:'i1',totalAmount:500}],subscriptions:[{id:'s1',paid:100}],subscriptionDrafts:[{id:'d1'}],settings:{workerName:'synthetic-worker'},futureExtension:{id:'preserved'}};
 const c={window:{},DEFAULT_WELCOME_DAILY:'',DEFAULT_WELCOME_STAY:'',normalizeBookingCommission:x=>x};vm.runInNewContext(code,c);
 const before=JSON.stringify(state),out=c.normalizeDB(state);
 for(const name of ['maintenanceJobs','installmentPurchases','subscriptions','subscriptionDrafts','expenses','futureExtension'])assert.equal(JSON.stringify(out[name]),JSON.stringify(state[name]),name);
 assert.equal(out.settings.workerName,state.settings.workerName);assert.equal(JSON.stringify(state),before);
});
test('malformed financial collections are rejected instead of normalized into empty ledgers',async()=>{
 const {c,shared,control}=harness();const before=JSON.stringify(c.db);shared.row.data={bookings:[],expenses:'malformed'};
 await assert.rejects(c.AdwaaPersistence.readRow(),e=>e.code==='ADWAA_INVALID_STATE');
 assert.equal(JSON.stringify(c.db),before);assert.equal(control.writes,0);
 c.db.maintenanceJobs='malformed';assert.throws(()=>c.persist(),e=>e.code==='ADWAA_INVALID_STATE');assert.equal(control.writes,0);
});
