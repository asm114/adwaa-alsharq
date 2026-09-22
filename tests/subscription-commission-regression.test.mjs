import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const financial=require('../subscription-financial-core.js');
const commissionSource=await readFile(new URL('../subscription-commission-core.js',import.meta.url),'utf8');
const workflowSource=await readFile(new URL('../commission-transfer-workflow.js',import.meta.url),'utf8');

function commissionWindow(subscription){
  const listeners={};
  const window={SubscriptionFinancialCore:financial,db:{subscriptions:[subscription],settings:{commissionEnabled:true,commissionMethod:'per_booking',commissionRate:100}},addEventListener:(name,fn)=>{listeners[name]=fn}};
  const document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(commissionSource,{window,document,console,Date,queueMicrotask(){}},{filename:'subscription-commission-core.js'});
  return window;
}

test('commission is earned only after verified completion and never auto-received',async()=>{
  let subscription=financial.reconcile({id:'s1',paymentManaged:true,total:1000,paymentHistory:[{id:'p1',amount:500}],visits:4});
  const window=commissionWindow(subscription);
  await window.normalizeSubscriptionCommissions({persist:false});
  assert.equal(window.subscriptionCommissionStatus(subscription),'not_earned');

  const completed=financial.appendPayment(subscription,{id:'p2',amount:500});
  Object.assign(subscription,completed);
  await window.normalizeSubscriptionCommissions({persist:false});
  assert.equal(window.subscriptionCommissionStatus(subscription),'earned');
  assert.equal(subscription.commissionSnapshot.amount,100);
  assert.equal(subscription.commissionSnapshot.received,false);
  assert.equal(subscription.commissionSnapshot.receivedAt,null);
});

test('commission workflow asks the manager explicitly and listens after subscription updates',()=>{
  assert.match(workflowSource,/هل تم استلام العمولة؟/);
  assert.match(workflowSource,/لا تُسجل العمولة كمستلمة إلا بعد تأكيدك/);
  assert.match(workflowSource,/adwaa-subscription-updated/);
  assert.match(workflowSource,/status:'received'/);
});
