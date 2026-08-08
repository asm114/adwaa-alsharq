import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('subscription state safety preserves subscriptions and drafts',async()=>{
  const source=await read('subscription-state-safety.js');
  const window={normalizeDB:value=>({bookings:Array.isArray(value?.bookings)?value.bookings:[]})};
  vm.runInNewContext(source,{window});
  const subscriptions=[{id:'sub-1'}];
  const subscriptionDrafts=[{id:'draft-1'}];
  const result=window.normalizeDB({bookings:[],subscriptions,subscriptionDrafts});
  assert.deepEqual(result.subscriptions,subscriptions);
  assert.deepEqual(result.subscriptionDrafts,subscriptionDrafts);
});

test('payment history exits when booking save remains open',async()=>{
  const source=await read('booking-payment-history.js');
  assert.match(source,/const result=await originalSave\.call\(this,event\);/);
  assert.match(source,/bookingModal'\)\?\.classList\.contains\('open'\)\)return result/);
});

test('portal loader cache-busts both safety fixes',async()=>{
  const source=await read('portal-final-admin.js');
  assert.match(source,/subscription-state-safety\.js\?v=20260808-1/);
  assert.match(source,/booking-payment-history\.js\?v=20260808-2/);
});
