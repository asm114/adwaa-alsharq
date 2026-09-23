const assert=require('node:assert/strict');
const test=require('node:test');

globalThis.SubscriptionFinancialCore=require('../subscription-financial-core.js');
const repair=require('../subscription-owner-confirmed-reconciliation.js');

function fixture(){
  return{subscriptions:[{
    id:repair.SUBSCRIPTION_ID,name:'نوره الفضل',paymentManaged:true,total:1950,paid:null,remaining:null,
    status:'paid',paymentStatus:'مدفوع بالكامل',paymentHistory:[
      {id:'p1',amount:900,date:'2026-08-08'},
      {id:'p2',amount:300,date:'2026-08-09'},
      {id:'p3',amount:300,date:'2026-08-27'},
      {id:'invalid',amount:null,date:'2026-09-22',note:'تم دفع حق ٣ طلعات كامله'}
    ]
  }]};
}

test('owner confirmation records the verified 450 once and preserves the null audit row',()=>{
  const state=fixture(),result=repair.applyReconciliation(state,{at:'2026-09-23T09:00:00.000Z'}),subscription=state.subscriptions[0];
  assert.equal(result.changed,true);
  assert.equal(globalThis.SubscriptionFinancialCore.stats(subscription).paid,1950);
  assert.equal(globalThis.SubscriptionFinancialCore.stats(subscription).due,0);
  assert.equal(globalThis.SubscriptionFinancialCore.stats(subscription).fullyPaid,true);
  assert.equal(subscription.paymentHistory.find(row=>row.id==='invalid').amount,null);
  const payment=subscription.paymentHistory.find(row=>row.id===repair.PAYMENT_ID);
  assert.equal(payment.amount,450);
  assert.equal(payment.historicalUnknownDate,true);
  assert.equal(payment.date,'');
  assert.equal(subscription.commissionSnapshot.status,'received_before_system');
  assert.equal(subscription.commissionSnapshot.amount,null);
  assert.equal(subscription.commissionSnapshot.amountUnverified,true);
});

test('owner-confirmed repair is idempotent and refuses changed financial evidence',()=>{
  const state=fixture();
  repair.applyReconciliation(state,{at:'2026-09-23T09:00:00.000Z'});
  const snapshot=structuredClone(state);
  const second=repair.applyReconciliation(state,{at:'2026-09-23T10:00:00.000Z'});
  assert.equal(second.changed,false);
  assert.deepEqual(state,snapshot);

  const changed=fixture();changed.subscriptions[0].paymentHistory[0].amount=800;
  const skipped=repair.applyReconciliation(changed,{at:'2026-09-23T10:00:00.000Z'});
  assert.equal(skipped.changed,false);
  assert.equal(skipped.skipped[0].reason,'subscription_finance_changed');
});
