import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('direct booking save hotfix parses and writes app_state explicitly',async()=>{
  const source=await read('booking-save-direct-production.js');
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.match(source,/\.from\('app_state'\)/);
  assert.match(source,/\.update\(payload\)/);
  assert.match(source,/\.eq\('id',rowId\)/);
  assert.match(source,/\.select\('id'\)/);
  assert.match(source,/directPersist\(\)/);
  assert.match(source,/verifyRemoteBooking/);
});

test('direct save surfaces real Supabase update errors',async()=>{
  const source=await read('booking-save-direct-production.js');
  assert.match(source,/فشل UPDATE المباشر في Supabase/);
  assert.match(source,/error\?\.code/);
  assert.match(source,/لم يتم حفظ الحجز في Supabase/);
});

test('production config owns booking submit and verifies Supabase before closing',async()=>{
  const config=await read('supabase-config.staging.js');
  assert.match(config,/BOOKING_SAVE_VERSION='20260922-1'/);
  assert.match(config,/document\.addEventListener\('submit'/);
  assert.match(config,/event\.target\?\.id!=='bookingForm'/);
  assert.match(config,/event\.stopImmediatePropagation\(\)/);
  assert.match(config,/writeStateAndVerifyBooking/);
  assert.match(config,/\.from\('app_state'\)/);
  assert.match(config,/\.update\(payload\)/);
  assert.match(config,/\.select\('data,updated_at'\)/);
  assert.match(config,/closeModal\('bookingModal'\)/);
  assert.ok(!config.includes('booking-save-direct-production.js?v=20260916-2'));
  assert.ok(!config.includes('booking-persist-update-path.js?v=20260916-2'));
  assert.match(config,/booking-save-stability\.js\?v=\$\{BOOKING_SAVE_VERSION\}/);
});

test('direct booking save verifies JSONB payment values independently of object key order',async()=>{
  const deposit={id:'deposit',type:'deposit',amount:200,method:'bank'};
  const balance={id:'balance',type:'payment',amount:500,method:'cash'};
  const booking={id:'booking',code:'1',total:700,paid:700,payments:[deposit,balance]};
  let stored;
  let paymentsAfterWrite;
  const query={
    update(payload){stored=JSON.parse(JSON.stringify(payload.data));return this},
    eq(){return this},
    select(columns){this.columns=columns;return this},
    async maybeSingle(){
      return this.columns!=='id'
        ? {data:{data:{bookings:[{...stored.bookings[0],payments:paymentsAfterWrite}]}}}
        : {data:{id:'main'}};
    }
  };
  const window={supabaseClient:{from(){return query}}};
  const context=vm.createContext({window,URL,db:{bookings:[booking]},normalizeDB:state=>state});
  vm.runInContext(await read('booking-financial-core.js'),context);
  const config=await read('supabase-config.staging.js');
  vm.runInContext(config.replace(/\}\)\(\);\s*$/,'window.verifyBooking=writeStateAndVerifyBooking;})();'),context);

  const reordered=[deposit,balance].map(({id,type,amount,method})=>({method,amount,type,id}));
  paymentsAfterWrite=reordered;
  await window.verifyBooking(booking);
  paymentsAfterWrite=[reordered[0],{...reordered[1],amount:499}];
  await assert.rejects(window.verifyBooking(booking),/سجل الدفعات في Supabase لا يطابق/);
  paymentsAfterWrite=[...reordered].reverse();
  await assert.rejects(window.verifyBooking(booking),/سجل الدفعات في Supabase لا يطابق/);
});
