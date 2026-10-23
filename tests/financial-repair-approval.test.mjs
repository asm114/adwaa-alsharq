import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const code=readFileSync(new URL('../booking-financial-reconciliation.js',import.meta.url),'utf8');
test('browser reconciliation has no startup writes and previews only a clone',()=>{
 let writes=0;const c={document:{readyState:'complete',addEventListener(){writes++}},console,localStorage:{setItem(){writes++}}};c.window=c;
 vm.runInNewContext(code,c);
 const api=c.BookingFinancialReconciliation;const p=api.plans[0];const state={bookings:[{id:p.id,code:p.code,total:p.total,paid:0,payments:[],status:p.expect.status}],customerCredits:[],resortAccount:{}};
 const before=JSON.stringify(state);api.preview(state);assert.equal(JSON.stringify(state),before);assert.equal(writes,0);
 assert.throws(()=>api.applyReconciliation(state),/موافقة/);assert.equal(JSON.stringify(state),before);
});
test('balance repair is preview-only and cannot save financial history',async()=>{
 let writes=0;const state={bookings:[{id:'b',payments:[{amount:200}],paid:100,customerCreditApplied:0}],resortAccount:{financialRepairVersion:0}};
 const c={db:state,document:{readyState:'loading',addEventListener(){}},console,setTimeout(){},addEventListener(){},persist:async()=>writes++,ResortAccountCore:require('../resort-account-core.js')};c.window=c;
 vm.runInNewContext(readFileSync(new URL('../resort-account-balance.js',import.meta.url),'utf8'),c);
 const before=JSON.stringify(state);const preview=await c.ResortAccountBalance.previewFinanceRepair();
 assert.equal(preview.changed,true);assert.equal(JSON.stringify(state),before);assert.equal(writes,0);
 await assert.rejects(c.ResortAccountBalance.repairFinanceOnce());assert.equal(JSON.stringify(state),before);
});
