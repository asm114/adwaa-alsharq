'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('../customer-credit-core.js');
const core=globalThis.CustomerCreditCore;

test('cancellation converts a 200 SAR deposit into customer credit once',()=>{
  const key=core.customerKey('عميل','0500000000');
  let ledger=core.addCreditOnce([],{
    customerKey:key,name:'عميل',phone:'0500000000',amount:200,
    sourceBookingId:'old-1',sourceBookingCode:'AD-TEST-1',createdAt:'2026-09-18T00:00:00Z'
  });
  ledger=core.addCreditOnce(ledger,{
    customerKey:key,name:'عميل',phone:'0500000000',amount:200,
    sourceBookingId:'old-1',sourceBookingCode:'AD-TEST-1',createdAt:'2026-09-18T00:00:00Z'
  });
  assert.equal(core.balanceFor(ledger,key),200);
  assert.equal(ledger.length,1);
  assert.equal(ledger[0].balanceAfter,200);
});

test('600/200 cancellation then 500 booking using 150 leaves 50 credit and no second cash revenue',()=>{
  const key=core.customerKey('عميل','0500000000');
  let ledger=core.addCreditOnce([],{
    customerKey:key,name:'عميل',phone:'0500000000',amount:200,
    sourceBookingId:'cancelled',sourceBookingCode:'AD-OLD'
  });
  assert.equal(core.balanceFor(ledger,key),200);

  ledger=core.setDebitForBooking(ledger,{
    customerKey:key,name:'عميل',phone:'0500000000',amount:150,
    targetBookingId:'new',targetBookingCode:'AD-NEW'
  });
  assert.equal(core.balanceFor(ledger,key),50);
  assert.equal(ledger.at(-1).balanceAfter,50);

  const booking={total:500,paid:150,customerCreditApplied:150};
  assert.equal(core.cashCollected(booking),0);
  assert.equal(Math.max(0,booking.total-booking.paid),350);
});

test('editing the same booking replaces rather than duplicates its credit debit',()=>{
  const key=core.customerKey('عميل','0500000000');
  let ledger=core.addCreditOnce([],{
    customerKey:key,name:'عميل',phone:'0500000000',amount:200,
    sourceBookingId:'cancelled'
  });
  ledger=core.setDebitForBooking(ledger,{customerKey:key,amount:150,targetBookingId:'new'});
  ledger=core.setDebitForBooking(ledger,{customerKey:key,amount:100,targetBookingId:'new'});
  assert.equal(ledger.filter(x=>x.type==='debit').length,1);
  assert.equal(core.balanceFor(ledger,key),100);
});

test('cancellation credit equals all cash received and is not duplicated',()=>{
  const booking={paid:500,payments:[{amount:200,type:'deposit'},{amount:300,type:'partial'}]};
  assert.equal(core.cancellationSettlement(booking),500);
  const key=core.customerKey('عميل','0500000000');
  let ledger=core.addCreditOnce([],{customerKey:key,amount:core.cancellationSettlement(booking),sourceBookingId:'cancelled-full'});
  ledger=core.addCreditOnce(ledger,{customerKey:key,amount:core.cancellationSettlement(booking),sourceBookingId:'cancelled-full'});
  assert.equal(core.balanceFor(ledger,key),500);
  assert.equal(ledger.length,1);
});
