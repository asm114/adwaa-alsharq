import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../customer-credit-core.js',import.meta.url),'utf8');
const context={globalThis:{},Date};
context.globalThis=context;
vm.runInNewContext(source,context);
const core=context.CustomerCreditCore;

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
