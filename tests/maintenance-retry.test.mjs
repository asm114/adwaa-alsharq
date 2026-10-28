import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('../resort-account-core.js');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('failed maintenance payment retries the same payment and expense, then persists',async()=>{
 let writes=0,closed=0,seq=0;
 const db={maintenanceJobs:[{id:'job',title:'صيانة',vendor:'فني',totalAmount:1200,finalCostKnown:true,payments:[]}],expenses:[]};
 const window={ResortAccountCore:core,persist:async()=>{writes++;if(writes===1)throw {message:'انقطاع تجريبي للاتصال'};return true},closeModal:()=>closed++};
 const context={window,db,crypto:{randomUUID:()=>`id-${++seq}`},document:{readyState:'loading',addEventListener(){}},setTimeout};
 const source=read('maintenance-open-cost.js').replace(/\}\)\(\);\s*$/, 'window.testSavePayment=savePayment;})();');
 vm.runInNewContext(source,context);
 const elements=Object.fromEntries(Object.entries({jobId:'job',paymentId:'',amount:'700',date:'2026-10-28',note:''}).map(([k,value])=>[k,{value}]));
 const event={preventDefault(){},currentTarget:{elements}};
 await assert.rejects(window.testSavePayment(event));
 const pid=elements.paymentId.value;
 assert.ok(pid);assert.equal(closed,0);assert.equal(db.expenses.length,1);
 await window.testSavePayment(event);
 assert.equal(writes,2);assert.equal(closed,1);assert.equal(elements.paymentId.value,pid);
 assert.equal(db.maintenanceJobs[0].payments.length,1);assert.equal(db.expenses.length,1);
 assert.equal(core.currentBalance(db),-700);assert.equal(core.maintenanceSummary(db.maintenanceJobs[0]).remaining,500);
});

function guardFixture(){
 const js=read('accounting-notes.js');
 const source=js.slice(js.indexOf('const busyForms=new WeakSet();'),js.indexOf('function preserveMaintenanceState'));
 const context={};vm.runInNewContext(source+';this.guard=guardedSubmit;',context);
 const buttons=[{disabled:false},{disabled:true}],status={hidden:true},attrs=new Map();
 const form={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),closest:()=>({querySelectorAll:()=>buttons}),querySelector:()=>status};
 return {guard:context.guard,form,status,buttons,attrs,event:{currentTarget:form,preventDefault(){}}};
}
test('guard catches network rejection, retains form and restores controls for retry',async()=>{
 const f=guardFixture();await f.guard(async()=>{throw {message:'انقطاع تجريبي للاتصال'}})(f.event);
 assert.equal(f.status.hidden,false);assert.match(f.status.textContent,/انقطاع تجريبي للاتصال/);
 assert.equal(f.buttons[0].disabled,false);assert.equal(f.buttons[1].disabled,true);assert.equal(f.attrs.has('aria-busy'),false);
 await f.guard(async()=>{})(f.event);assert.equal(f.status.hidden,true);
});
test('guard ignores repeated submit until the current save finishes',async()=>{
 const f=guardFixture();let finish,calls=0;const submit=f.guard(async()=>{calls++;await new Promise(r=>finish=r)});
 const pending=submit(f.event);await submit(f.event);assert.equal(calls,1);assert.equal(f.buttons[0].disabled,true);
 finish();await pending;assert.equal(f.buttons[0].disabled,false);
});
