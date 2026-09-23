const assert=require('node:assert/strict');
const test=require('node:test');
const core=require('../subscription-financial-core.js');

const nora={
  id:'ed495f64-342b-4ccb-9c99-0d463ee2606c',name:'نوره الفضل',paymentManaged:true,
  total:1950,paid:0,status:'paid',paymentStatus:'مدفوع بالكامل',
  paymentHistory:[
    {id:'p1',amount:900,date:'2026-08-08'},
    {id:'p2',amount:300,date:'2026-08-09'},
    {id:'p3',amount:300,date:'2026-08-27'},
    {id:'p4',amount:null,date:'2026-09-22',note:'تم دفع حق ٣ طلعات كامله'}
  ]
};

test('Nora uses verified payment history without inventing the missing amount',()=>{
  const finance=core.stats(nora);
  assert.equal(finance.total,1950);
  assert.equal(finance.paid,1500);
  assert.equal(finance.due,450);
  assert.equal(finance.fullyPaid,false);
  assert.equal(finance.invalidPayments.length,1);
  assert.equal(core.paymentMovements(nora).length,3);
  const reconciled=core.reconcile(nora);
  assert.equal(reconciled.status,'partial');
  assert.equal(reconciled.paymentStatus,'مدفوع جزئيًا');
  assert.equal(reconciled.paymentHistory[3].amount,null);
});

test('null and zero payment rows never complete a subscription',()=>{
  const subscription={total:1000,paid:1000,paymentHistory:[{amount:null},{amount:0}]};
  assert.deepEqual(core.stats(subscription).paid,0);
  assert.equal(core.stats(subscription).fullyPaid,false);
});

test('partial payment then completion produces one ledger and exact full-payment state',()=>{
  let subscription=core.reconcile({id:'s1',total:1000,paymentManaged:true,paymentHistory:[{id:'p1',amount:500}]});
  assert.equal(core.stats(subscription).due,500);
  subscription=core.appendPayment(subscription,{id:'p2',amount:500,date:'2026-09-22'});
  assert.equal(core.stats(subscription).paid,1000);
  assert.equal(core.stats(subscription).due,0);
  assert.equal(core.stats(subscription).fullyPaid,true);
  assert.equal(subscription.paymentStatus,'مدفوع بالكامل');
  assert.throws(()=>core.appendPayment(subscription,{amount:1}),/SUBSCRIPTION_ALREADY_PAID/);
});

test('overpayment is a review issue, not paid in full',()=>{
  const subscription={id:'s2',paymentManaged:true,total:1000,paymentHistory:[{amount:1100}],status:'paid',paymentStatus:'مدفوع بالكامل'};
  const finance=core.stats(subscription);
  assert.equal(finance.overpaid,100);
  assert.equal(finance.fullyPaid,false);
  assert.ok(core.integrityIssues({subscriptions:[subscription]}).some(row=>row.type==='subscription_overpaid'));
});

test('legacy paid is used only when no payment ledger exists',()=>{
  assert.equal(core.stats({total:1000,paid:500,paymentHistory:[]}).paid,500);
  assert.equal(core.stats({total:1000,paid:500,paymentHistory:[{amount:null}]}).paid,0);
});

test('subscription visits cannot create independent finance and orphan visits are reported',()=>{
  const issues=core.integrityIssues({subscriptions:[],bookings:[{id:'v1',subscriptionId:'missing',subscriptionVisit:true,total:500,paid:500,commissionSnapshot:{amount:100,status:'earned'}}]});
  assert.ok(issues.some(row=>row.type==='orphan_subscription_visit'));
  assert.ok(issues.some(row=>row.type==='subscription_visit_finance'));
  assert.ok(issues.some(row=>row.type==='subscription_visit_commission'));
});
