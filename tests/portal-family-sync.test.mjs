import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncHarness} from './helpers/portal-booking-sync-harness.mjs';
const family=(extra={})=>({id:'family-18',code:'new-code',recordType:'family',date:'2026-10-18',type:'يومي',stayDays:1,status:'مؤكد',...extra});
const row=(extra={})=>({id:'owned-18',start_date:'2026-10-18',end_date:'2026-10-18',source_type:'booking',booking_id:'family-18',...extra});

test('adding a one-day family presence closes October 18 after core save',async()=>{
  const h=createSyncHarness({bookings:[],saveBooking:state=>state.bookings.push(family()),exposeWindowState:false});
  await h.saveBooking();
  assert.equal(h.rows.length,1);
  assert.equal(h.rows[0].start_date,'2026-10-18');
  assert.equal(h.rows[0].booking_id,'family-18');
});
test('a multi-day family stay closes every occupied day, excluding checkout',async()=>{
  const h=createSyncHarness({bookings:[family({type:'مبيت',stayDays:3})]});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.rows.map(row=>row.start_date),['2026-10-18','2026-10-19','2026-10-20']);
});
test('real customer bookings use the same sync without transferring private fields',async()=>{
  const h=createSyncHarness({bookings:[family({recordType:'customer',name:'PRIVATE',phone:'PRIVATE',total:1234,paid:456,payments:[{amount:456}]})]});
  assert.equal(await h.reconcile(),true);
  const payload=h.operations.find(op=>op.action==='insert').payload;
  assert.deepEqual(Object.keys(payload).sort(),['booking_id','end_date','source_type','start_date']);
  assert.equal(h.state.bookings[0].total,1234);
  assert.equal(h.state.bookings[0].paid,456);
});
test('moving dates creates new closures before removing only the same owner old day',async()=>{
  const h=createSyncHarness({bookings:[family({date:'2026-10-19'})],periods:[row(),row({id:'other',start_date:'2026-10-20',end_date:'2026-10-20',booking_id:'another'})]});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.operations.map(op=>op.action),['insert','delete']);
  assert.deepEqual(h.rows.map(row=>row.start_date).sort(),['2026-10-19','2026-10-20']);
});
test('cancellation preserves manual and legacy periods unchanged',async()=>{
  const protectedRows=[row({id:'manual',source_type:'manual',booking_id:null,start_date:'2026-10-19',end_date:'2026-10-19'}),row({id:'legacy',source_type:'legacy',booking_id:null,start_date:'2026-10-20',end_date:'2026-10-20'})];
  const h=createSyncHarness({bookings:[family({status:'ملغي'})],periods:[row(),...protectedRows]});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.rows,protectedRows);
});
test('a pre-existing manual closure is preserved and reported, not adopted',async()=>{
  const manual=row({source_type:'manual',booking_id:null});
  const h=createSyncHarness({bookings:[family()],periods:[manual]});
  assert.equal(await h.reconcile(),false);
  assert.deepEqual(h.rows,[manual]);
  assert.equal(h.operations.length,0);
});
test('two bookings on the same day remain closed; cancelling the owner hands off without opening',async()=>{
  const h=createSyncHarness({bookings:[family(),family({id:'customer-18',recordType:'customer'})],periods:[row()]});
  assert.equal(await h.reconcile(),false);
  assert.equal(h.rows.length,1);
  h.state.bookings[0].status='ملغي';
  assert.equal(await h.reconcile(),true);
  assert.equal(h.rows.length,1);
  assert.equal(h.rows[0].booking_id,'customer-18');
  assert.deepEqual(h.operations.map(op=>op.action),['transfer']);
});
for(const failure of ['coreRead','portalRead','insert'])test(`${failure} failure during a move never releases the old closure`,async()=>{
  const old=row();
  const h=createSyncHarness({bookings:[family({date:'2026-10-19'})],periods:[old],faults:{[failure]:true}});
  assert.equal(await h.reconcile(),false);
  assert.deepEqual(h.rows,[old]);
  assert.ok(h.messages.some(message=>message.type==='error'));
});
test('failed administrative save performs no portal write and never reports success',async()=>{
  const h=createSyncHarness({saveBooking:state=>state.bookings.push(family()),faults:{coreWrite:true}});
  await h.saveBooking();
  assert.equal(h.rows.length,0);
  assert.ok(!h.messages.some(message=>message.type==='success'));
});
test('a stale local cancellation cannot open a remotely active booking day',async()=>{
  const h=createSyncHarness({bookings:[family({status:'ملغي'})],remoteBookings:[family()],periods:[row()]});
  assert.equal(await h.reconcile(),true);
  assert.deepEqual(h.rows,[row()]);
});
test('delete permission failure is visible and preserves closure',async()=>{
  const h=createSyncHarness({bookings:[family({status:'ملغي'})],periods:[row()],faults:{silentDelete:true}});
  assert.equal(await h.reconcile(),false);
  assert.deepEqual(h.rows,[row()]);
});
test('repeated and concurrent reconciliation creates no duplicate closures',async()=>{
  const h=createSyncHarness({bookings:[family()]});
  assert.deepEqual(await Promise.all([h.reconcile(),h.reconcile(),h.reconcile()]),[true,true,true]);
  assert.equal(h.rows.length,1);
  assert.equal(h.operations.filter(op=>op.action==='insert').length,1);
});
test('a source change during reconciliation prevents releasing the old day',async()=>{
  const h=createSyncHarness({bookings:[family({date:'2026-10-19'})],periods:[row()],onCoreRead:(state,count)=>{if(count===2)state.bookings[0].date='2026-10-18'}});
  assert.equal(await h.reconcile(),false);
  assert.ok(h.rows.some(period=>period.id==='owned-18'));
  assert.ok(!h.operations.some(op=>op.action==='delete'));
});
test('an explicit failed deletion survives reload and removes only its own closure on retry',async()=>{
  const unknown=row({id:'unknown',booking_id:'unknown',start_date:'2026-10-20',end_date:'2026-10-20'});
  const h=createSyncHarness({bookings:[family()],selectedBookingId:'family-18',periods:[row(),unknown],faults:{portalRead:true}});
  await h.deleteBooking();
  assert.equal(h.rows.length,2);
  const retry=createSyncHarness({bookings:[],periods:h.rows,storage:h.storage});
  assert.equal(await retry.reconcile(),true);
  assert.deepEqual(retry.rows,[unknown]);
});
