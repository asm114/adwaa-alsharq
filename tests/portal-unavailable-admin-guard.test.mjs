import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('manual portal admin guard protects booking and legacy rows',async()=>{
  const guard=await read('portal-unavailable-ownership-guard.js');
  assert.match(guard,/const SOURCE_MANUAL='manual'/);
  assert.match(guard,/period\.source_type!==SOURCE_MANUAL/);
  assert.match(guard,/هذا التاريخ مرتبط بحجز ويُدار تلقائيًا/);
  assert.match(guard,/فترة قديمة محفوظة للمرجعية/);
  assert.match(guard,/window\.editPortalUnavailablePeriod=async/);
  assert.match(guard,/window\.savePortalUnavailablePeriod=async/);
  assert.match(guard,/window\.deletePortalUnavailablePeriod=async/);
  assert.match(guard,/حجز تلقائي — للقراءة فقط/);
  assert.match(guard,/قديم — للقراءة فقط/);
});

test('dedicated portal backend loads the ownership guard',async()=>{
  const compat=await read('portal-dedicated-backend-compat.js');
  assert.match(compat,/portal-unavailable-ownership-guard\.js\?v=20260831-1/);
});

test('legacy auto-sync is not loaded by official production entry points',async()=>{
  const [index,finalAdmin,subscription]=await Promise.all([
    read('index.html'),
    read('portal-final-admin.js'),
    read('subscription-booking-type.js')
  ]);
  for(const source of [index,finalAdmin,subscription])assert.doesNotMatch(source,/portal-booking-auto-sync\.js/);
  assert.match(finalAdmin,/portal-booking-sync-stable\.js\?v=20260831-1/);
});
