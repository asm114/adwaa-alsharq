import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const core=require('../subscription-financial-core.js');
const source=await readFile(new URL('../subscription-customer-finance.js',import.meta.url),'utf8');

test('smart customer record reads subscription main ledger and ignores visit finance',()=>{
  const customer={name:'نوره الفضل',phone:'0505126716',bookings:[{id:'visit',subscriptionId:'s1',subscriptionPaymentManaged:true,total:0,paid:0}]};
  const window={SubscriptionFinancialCore:core,db:{subscriptions:[{id:'s1',name:customer.name,phone:customer.phone,paymentManaged:true,total:1950,paid:0,paymentHistory:[{amount:900},{amount:300},{amount:300},{amount:null}]}],bookings:customer.bookings},addEventListener(){}};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelectorAll(){return[]}};
  vm.runInNewContext(source,{window,document,console,setTimeout(){},queueMicrotask(){}},{filename:'subscription-customer-finance.js'});
  const result=window.subscriptionFinanceForCustomer(customer);
  assert.equal(result.totalValue,1950);
  assert.equal(result.totalPaid,1500);
  assert.equal(result.totalDue,450);
  assert.equal(result.paymentStatus,'مدفوع جزئيًا');
});
