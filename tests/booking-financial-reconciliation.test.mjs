import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
globalThis.CustomerCreditCore=require(fileURLToPath(new URL('../customer-credit-core.js',import.meta.url)));
const repair=require(fileURLToPath(new URL('../booking-financial-reconciliation.js',import.meta.url)));

function booking(code,id,total,paid,status,payments=[],extra={}){
  return {code,id,total,paid,status,payments,name:extra.name||code,phone:extra.phone||'0500000000',date:extra.date||'2026-09-01',customerCreditApplied:0,...extra};
}
function fixture(){
  return {
    bookings:[
      booking('AD-0010','f80356ff-2bc2-4e62-97f8-c40c9761dfb8',5200,0,'تم الدخول',[],{date:'2026-07-19'}),
      booking('AD-0019','26d8ee99-dfbc-45c6-be86-8afc04f2c699',600,0,'مؤكد',[],{date:'2026-07-28'}),
      booking('AD-0026','7d89558f-0a4b-45a9-974e-967fb52a0a3a',600,600,'ملغي',[{id:'becbe1eb-299e-453c-a1c5-4d33fc91bc4c',amount:600,type:'legacy',date:'2026-09-25',createdAt:'2026-09-08T05:57:05.908Z'}],{date:'2026-09-25'}),
      booking('AD-0027','4836283f-9770-44ad-b3e9-8ebaf6e7ea9c',600,0,'مؤكد',[],{date:'2026-10-23'}),
      booking('AD-0028','b9b422d3-9e77-4ab4-bdb8-e0734bf6f071',600,0,'مؤكد',[],{date:'2026-11-20'}),
      booking('AD-0032','f8398271-ff54-40b9-b904-5b60c4755ff7',1500,1134,'تم الخروج',[
        {id:'d30583b0-490a-4e27-98af-0b62b9995000',amount:300,type:'legacy',order:0},
        {id:'5cc3b409-f8ac-4f2d-873e-a733aff7a2a0',amount:834,type:'partial',order:1}
      ]),
      booking('AD-0072','8f4d89c6-462f-4ab3-9b62-9140d2256adf',650,550,'تم الخروج',[
        {id:'f17ffe5f-3345-493e-90c0-dabe94c7596c',amount:550,type:'final',order:1}
      ]),
      booking('AD-0074','e70e4403-a45e-4353-92ca-ecb54ed2972a',5600,0,'مؤكد',[],{date:'2027-03-07'}),
      booking('AD-0075','8df2d8c3-1092-4fbf-933c-96a29c57bce5',700,0,'تم الدخول',[]),
      booking('AD-0076','83d39268-4385-43a2-9836-765b82b61b24',1500,0,'ملغي',[],{name:'هدى الجريس',phone:'0599359828',date:'2026-09-10'}),
      booking('AD-0077','9353829a-9153-4a1b-b246-29ed3e1167fe',650,0,'مؤكد',[])
    ],
    customerCredits:[]
  };
}

test('repairs documented booking payments and postponement without guessing',()=>{
  const state=fixture();
  const result=repair.applyReconciliation(state,{at:'2026-09-22T12:00:00.000Z'});
  assert.equal(result.skipped.length,0);
  assert.ok(result.applied.includes('AD-0074'));
  assert.equal(state.bookings.find(x=>x.code==='AD-0074').paid,3000);
  assert.equal(state.bookings.find(x=>x.code==='AD-0074').payments[0].id,'f4866b9e-3289-41a9-8ddb-cd06859ba267');
  assert.equal(state.bookings.find(x=>x.code==='AD-0032').paid,1500);
  assert.equal(state.bookings.find(x=>x.code==='AD-0032').payments.at(-1).amount,366);
  assert.equal(state.bookings.find(x=>x.code==='AD-0072').paid,650);
  assert.equal(state.bookings.find(x=>x.code==='AD-0075').status,'تم الخروج');
  const postponed=state.bookings.find(x=>x.code==='AD-0026');
  assert.equal(postponed.status,'مؤجل');
  assert.equal(postponed.date,'');
  assert.equal(postponed.postponedFromDate,'2026-09-25');
});

test('restores Huda payment and creates one customer credit without new cash duplication',()=>{
  const state=fixture();
  repair.applyReconciliation(state,{at:'2026-09-22T12:00:00.000Z'});
  const huda=state.bookings.find(x=>x.code==='AD-0076');
  assert.equal(huda.paid,500);
  assert.equal(huda.status,'ملغي');
  assert.equal(huda.depositCancellation.status,'credit');
  assert.equal(state.customerCredits.filter(x=>x.type==='credit'&&x.sourceBookingId===huda.id).length,1);
  assert.equal(state.customerCredits.find(x=>x.sourceBookingId===huda.id).amount,500);
  repair.applyReconciliation(state,{at:'2026-09-22T13:00:00.000Z'});
  assert.equal(state.customerCredits.filter(x=>x.type==='credit'&&x.sourceBookingId===huda.id).length,1);
});

test('does not overwrite a booking that changed after the audited backup',()=>{
  const state=fixture();
  const saleh=state.bookings.find(x=>x.code==='AD-0074');
  saleh.paid=100;
  saleh.payments=[{id:'new-payment',amount:100,type:'partial'}];
  const before=structuredClone(saleh);
  const result=repair.applyReconciliation(state,{at:'2026-09-22T12:00:00.000Z'});
  assert.deepEqual(saleh,before);
  assert.ok(result.skipped.some(x=>x.code==='AD-0074'&&x.reason==='payments_changed'));
});

test('repair is idempotent after a successful application',()=>{
  const state=fixture();
  const first=repair.applyReconciliation(state,{at:'2026-09-22T12:00:00.000Z'});
  assert.equal(first.skipped.length,0);
  const snapshot=structuredClone(state);
  const second=repair.applyReconciliation(state,{at:'2026-09-22T13:00:00.000Z'});
  assert.equal(second.changed,false);
  assert.equal(second.skipped.length,0);
  assert.deepEqual(state,snapshot);
});
