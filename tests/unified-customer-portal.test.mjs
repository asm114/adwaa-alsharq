import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('imported portal reads the same unavailable periods that booking synchronization writes',async()=>{
  const [sync,portal]=await Promise.all([
    read('portal-booking-sync-stable.js'),
    read('customer-portal/portal.js')
  ]);
  assert.match(sync,/const TABLE='customer_portal_unavailable_periods'/);
  assert.match(sync,/source_type:SOURCE_BOOKING,booking_id:owner/);
  assert.match(portal,/\.from\('customer_portal_unavailable_periods'\)\s*\.select\('id,start_date,end_date'\)/);
  assert.match(portal,/iso>=period\.start_date&&iso<=period\.end_date/);
});

test('the imported portal retains its separate Supabase project',async()=>{
  const [portal,feedback,admin,core]=await Promise.all([
    read('customer-portal/portal.js'),
    read('customer-portal/feedback.js'),
    read('customer-portal/admin/index.html'),
    read('supabase-config.staging.js')
  ]);
  for(const source of [portal,feedback,admin]){
    assert.match(source,/ztqqdjryvecscidxxbfe\.supabase\.co/);
    assert.doesNotMatch(source,/pgdvlklpyrvmwzitsmbw\.supabase\.co/);
  }
  assert.match(core,/pgdvlklpyrvmwzitsmbw/);
});
