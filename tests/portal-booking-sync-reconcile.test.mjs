import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncHarness} from './helpers/portal-booking-sync-harness.mjs';

const booking=(overrides={})=>({id:'booking-a',date:'2026-09-10',type:'يومي',status:'مؤكد',portalUnavailablePeriodIds:{},...overrides});
const period=(overrides={})=>({id:'period-a',start_date:'2026-09-10',end_date:'2026-09-10',source_type:'booking',booking_id:'booking-a',...overrides});

test('stale local mapping is replaced when portal row is missing',async()=>{
  const h=createSyncHarness({bookings:[booking({portalUnavailablePeriodIds:{'2026-09-10':'missing-id'}})]});
  assert.equal(await h.reconcile(),true);
  assert.equal(h.rows.length,1);
  assert.equal(h.state.bookings[0].portalUnavailablePeriodIds['2026-09-10'],h.rows[0].id);
});

test('existing owned portal row is reused when mapping is missing',async()=>{
  const h=createSyncHarness({bookings:[booking()],periods:[period()]});
  await h.reconcile();
  assert.equal(h.rows.length,1);
  assert.equal(h.state.bookings[0].portalUnavailablePeriodIds['2026-09-10'],'period-a');
});

test('same date owned by another booking is not stolen',async()=>{
  const h=createSyncHarness({bookings:[booking()],periods:[period({booking_id:'booking-b'})]});
  assert.equal(await h.reconcile(),false);
  assert.equal(h.rows[0].booking_id,'booking-b');
  assert.deepEqual(h.state.bookings[0].portalUnavailablePeriodIds,{});
});

test('changing a booking date deletes only its old row and creates the new day',async()=>{
  const h=createSyncHarness({bookings:[booking({date:'2026-09-11',portalUnavailablePeriodIds:{'2026-09-10':'period-a'}})],periods:[period()]});
  await h.reconcile();
  assert.deepEqual(h.rows.map(row=>row.start_date),['2026-09-11']);
  assert.ok(h.state.bookings[0].portalUnavailablePeriodIds['2026-09-11']);
});

test('cancelling a booking removes only its booking-owned rows',async()=>{
  const h=createSyncHarness({bookings:[booking({status:'ملغي'})],periods:[period(),period({id:'manual-a',source_type:'manual',booking_id:null,start_date:'2026-09-12',end_date:'2026-09-12'})]});
  await h.reconcile();
  assert.deepEqual(h.rows.map(row=>row.id),['manual-a']);
});

test('deleting a booking removes all rows for that booking id only',async()=>{
  const h=createSyncHarness({bookings:[booking()],selectedBookingId:'booking-a',periods:[period(),period({id:'period-unmapped',start_date:'2026-09-11',end_date:'2026-09-11'}),period({id:'manual-a',source_type:'manual',booking_id:null,start_date:'2026-09-12',end_date:'2026-09-12'})]});
  await h.deleteBooking();
  await h.reconcile();
  assert.deepEqual(h.rows.map(row=>row.id),['manual-a']);
});

test('orphan booking rows are removed even when deletion was outside the wrapped UI',async()=>{
  const rows=[period({id:'orphan-booking',booking_id:'booking-deleted'}),period({id:'manual-a',source_type:'manual',booking_id:null,start_date:'2026-09-12',end_date:'2026-09-12'}),period({id:'legacy-a',source_type:'legacy',booking_id:null,start_date:'2026-09-13',end_date:'2026-09-13'})];
  const h=createSyncHarness({bookings:[],periods:rows});
  await h.reconcile();
  assert.deepEqual(h.rows.map(row=>row.id),['manual-a','legacy-a']);
});

test('multi-day stay creates and maps every occupied day',async()=>{
  const h=createSyncHarness({bookings:[booking({type:'مبيت',stayDays:3})]});
  await h.reconcile();
  assert.deepEqual(h.rows.map(row=>row.start_date),['2026-09-10','2026-09-11','2026-09-12']);
  assert.equal(Object.keys(h.state.bookings[0].portalUnavailablePeriodIds).length,3);
});

test('manual and legacy rows remain unchanged',async()=>{
  const rows=[period({id:'manual-a',source_type:'manual',booking_id:null}),period({id:'legacy-a',source_type:'legacy',booking_id:null,start_date:'2026-09-12',end_date:'2026-09-12'})];
  const h=createSyncHarness({bookings:[booking()],periods:rows});
  await h.reconcile();
  assert.deepEqual(h.rows,rows);
});

test('reconcile is idempotent and never creates duplicates',async()=>{
  const h=createSyncHarness({bookings:[booking()]});
  await h.reconcile();
  const first=structuredClone(h.rows);
  await h.reconcile();
  assert.deepEqual(h.rows,first);
});

test('historical legacy overlap is not reported as an availability conflict',async()=>{
  const rows=[period({id:'legacy-history',source_type:'legacy',booking_id:null,start_date:'2026-08-02',end_date:'2026-08-07'})];
  const h=createSyncHarness({today:'2026-08-31',bookings:[booking({date:'2026-08-04'})],periods:rows});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.rows,rows);
  assert.deepEqual(h.lastResult().conflicts,[]);
});

test('historical booking rows and mappings are preserved without rewrite',async()=>{
  const old=period({id:'history-owned',start_date:'2026-08-20',end_date:'2026-08-20'});
  const h=createSyncHarness({today:'2026-08-31',bookings:[booking({date:'2026-08-20',portalUnavailablePeriodIds:{'2026-08-20':'history-owned'}})],periods:[old]});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.rows,[old]);
  assert.equal(h.state.bookings[0].portalUnavailablePeriodIds['2026-08-20'],'history-owned');
});

test('stay that started in the past syncs only today and future occupied days',async()=>{
  const h=createSyncHarness({today:'2026-08-31',bookings:[booking({date:'2026-08-30',type:'مبيت',stayDays:3})]});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.rows.map(row=>row.start_date),['2026-08-31','2026-09-01']);
  assert.deepEqual(Object.keys(h.state.bookings[0].portalUnavailablePeriodIds),['2026-08-31','2026-09-01']);
});

test('today or future conflicts are still blocked and reported',async()=>{
  const futureLegacy=period({id:'legacy-future',source_type:'legacy',booking_id:null,start_date:'2026-09-10',end_date:'2026-09-10'});
  const h=createSyncHarness({today:'2026-08-31',bookings:[booking()],periods:[futureLegacy]});
  assert.equal(await h.reconcile(),false);
  assert.equal(h.lastResult().conflicts.length,1);
  assert.equal(h.lastResult().conflicts[0].sourceType,'legacy');
  assert.deepEqual(h.rows,[futureLegacy]);
});