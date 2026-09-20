import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const require=createRequire(import.meta.url);
const core=require(fileURLToPath(new URL('../resort-account-core.js',import.meta.url)));

const baseState={
  bookings:[
    {
      id:'b1',code:'1001',name:'عميل 1',recordType:'customer',status:'مؤكد',paid:1200,customerCreditApplied:200,
      payments:[{id:'p1',amount:1000,type:'partial',method:'transfer',date:'2026-09-18',createdAt:'2026-09-18T10:00:00Z'}],
      commissionSnapshot:{status:'received',received:true,receivedAt:'2026-09-18T12:00:00Z',amount:100}
    },
    {
      id:'b2',code:'1002',name:'عميل 2',recordType:'customer',status:'ملغي',paid:300,customerCreditApplied:0,
      payments:[{id:'p2',amount:300,type:'deposit',method:'transfer',date:'2026-09-18',createdAt:'2026-09-18T09:00:00Z'}],
      depositCancellation:{status:'credit',refundAmount:0,recordedAt:'2026-09-18T11:00:00Z'}
    },
    {
      id:'b3',code:'1003',name:'عميل 3',recordType:'customer',status:'ملغي',paid:300,customerCreditApplied:0,
      payments:[{id:'p3',amount:300,type:'deposit',method:'cash',date:'2026-09-18',createdAt:'2026-09-18T09:30:00Z'}],
      depositCancellation:{status:'refunded',refundAmount:300,recordedAt:'2026-09-18T11:30:00Z'}
    }
  ],
  subscriptions:[{
    id:'s1',name:'اشتراك 1',paid:400,total:800,paymentManaged:true,
    paymentHistory:[{id:'sp1',amount:400,date:'2026-09-18T08:00:00Z',method:'transfer'}]
  }],
  expenses:[{id:'e1',ref:'EXP-1',title:'كهرباء',amount:200,date:'2026-09-18',createdAt:'2026-09-18T13:00:00Z',paymentMethod:'transfer'}],
  accountingNotes:[{
    id:'a1',title:'سلفة شخصية',principalAmount:500,date:'2026-09-18',createdAt:'2026-09-18T14:00:00Z',
    payments:[{id:'ap1',amount:150,date:'2026-09-18',createdAt:'2026-09-18T15:00:00Z'}]
  }],
  resortAccount:{calibration:null,financialRepairVersion:1,manualMovements:[
    {id:'m1',direction:'in',amount:50,date:'2026-09-18',createdAt:'2026-09-18T16:00:00Z',note:'دعم تشغيل'}
  ]}
};

test('resort balance includes all real cash inflows and outflows without treating customer credit as new cash',()=>{
  const details=core.balanceDetails(baseState);
  assert.equal(details.balance,1100);
  assert.equal(core.customerCashCollected(baseState,()=>true),2000);
  assert.equal(core.cashOutflow(baseState,()=>true),1100);
  assert.equal(details.allMovements.filter(x=>x.kind==='booking_payment').reduce((s,x)=>s+x.amount,0),1600);
  assert.equal(details.allMovements.filter(x=>x.kind==='customer_refund').reduce((s,x)=>s+x.amount,0),-300);
  assert.equal(details.allMovements.filter(x=>x.kind==='commission_transfer').reduce((s,x)=>s+x.amount,0),-100);
  assert.equal(details.allMovements.filter(x=>x.kind==='personal_advance').reduce((s,x)=>s+x.amount,0),-500);
  assert.equal(details.allMovements.filter(x=>x.kind==='advance_repayment').reduce((s,x)=>s+x.amount,0),150);
});

test('customer credit itself is not counted as cash receipt',()=>{
  const state={bookings:[{id:'b',code:'1',name:'عميل',paid:500,customerCreditApplied:150,recordType:'customer',payments:[{id:'p',amount:350,date:'2026-09-18',createdAt:'2026-09-18T10:00:00Z'}]}]};
  assert.equal(core.customerCashCollected(state,()=>true),350);
  assert.equal(core.currentBalance(state),350);
});

test('calibration makes the confirmed current balance the baseline and only later movements change it',()=>{
  const state=structuredClone(baseState);
  state.resortAccount.calibration={balance:5000,at:'2026-09-20T10:00:00Z',note:'مطابقة فعلية'};
  state.expenses.push({id:'e2',ref:'EXP-2',title:'صيانة',amount:200,date:'2026-09-20',createdAt:'2026-09-20T11:00:00Z'});
  assert.equal(core.currentBalance(state),4800);
  assert.equal(core.balanceDetails(state).outflow,200);
});

test('financial integrity flags booking payment + customer credit mismatch',()=>{
  const state={bookings:[{id:'b',code:'9',recordType:'customer',paid:350,customerCreditApplied:150,payments:[{id:'p',amount:350}]}]};
  const issues=core.integrityIssues(state);
  assert.ok(issues.some(x=>x.type==='booking_payment_total'));
});
