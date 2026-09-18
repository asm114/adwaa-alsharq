'use strict';
const assert=require('assert');
require('../customer-credit-core.js');
const core=globalThis.CustomerCreditCore;

const key=core.customerKey('عميل تجريبي','0500000000');
let ledger=[];

ledger=core.addCreditOnce(ledger,{
  customerKey:key,name:'عميل تجريبي',phone:'0500000000',amount:200,
  sourceBookingId:'B1',sourceBookingCode:'1001',createdAt:'2026-09-18T10:00:00.000Z'
});
assert.strictEqual(core.balanceFor(ledger,key),200);
assert.strictEqual(ledger.length,1);
assert.strictEqual(ledger[0].balanceAfter,200);
assert.strictEqual(ledger[0].sourceBookingId,'B1');
assert.strictEqual(ledger[0].targetBookingId,'');

ledger=core.addCreditOnce(ledger,{
  customerKey:key,name:'عميل تجريبي',phone:'0500000000',amount:200,
  sourceBookingId:'B1',sourceBookingCode:'1001',createdAt:'2026-09-18T10:01:00.000Z'
});
assert.strictEqual(ledger.length,1,'لا يجوز إنشاء رصيد مكرر لنفس الحجز الملغي');

ledger=core.setDebitForBooking(ledger,{
  customerKey:key,name:'عميل تجريبي',phone:'0500000000',amount:150,
  targetBookingId:'B2',targetBookingCode:'1002',createdAt:'2026-09-18T11:00:00.000Z'
});
assert.strictEqual(core.balanceFor(ledger,key),50);
assert.strictEqual(ledger[1].balanceAfter,50);
assert.strictEqual(ledger[1].targetBookingId,'B2');

const newBooking={total:500,paid:150,customerCreditApplied:150};
assert.strictEqual(core.cashCollected(newBooking),0,'استخدام 150 من الرصيد لا يعد تحصيلاً نقديًا جديدًا');

const fullySettled={total:500,paid:500,customerCreditApplied:150};
assert.strictEqual(core.cashCollected(fullySettled),350,'التحصيل النقدي الجديد يجب أن يكون 350 فقط');

ledger=core.setDebitForBooking(ledger,{
  customerKey:key,name:'عميل تجريبي',phone:'0500000000',amount:100,
  targetBookingId:'B2',targetBookingCode:'1002',createdAt:'2026-09-18T12:00:00.000Z'
});
assert.strictEqual(core.balanceFor(ledger,key),100,'تعديل استخدام الرصيد في نفس الحجز يجب أن يستبدل الحركة السابقة لا أن يكررها');
assert.strictEqual(ledger.filter(x=>x.type==='debit'&&x.targetBookingId==='B2').length,1);

console.log('PASS customer-credit-core: deposit 200 -> use 150 -> balance 50; no double cash count; debit replacement protected.');
