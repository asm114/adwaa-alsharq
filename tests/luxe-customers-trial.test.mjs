import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../luxe-customers-trial.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('customer registry refinement is isolated and loaded last',()=>{
  assert.match(loader,/luxe-customers-trial\.css\?v=20260821-1/);
  assert.match(loader,/dataset\.luxeCustomersTrial/);
  assert.match(css,/simple-view-customers/);
  assert.doesNotMatch(css,/supabase|localStorage|persist\s*\(|booking_id|customer_portal/i);
});

test('customer list is compact and names-first without touching full record data',()=>{
  assert.match(css,/#customerList h4/);
  assert.match(css,/#customerList \.customer-name/);
  assert.match(css,/#customerList \.customer-phone[\s\S]*display:none!important/);
  assert.match(css,/#customerList \.customer-stat[\s\S]*display:none!important/);
  assert.doesNotMatch(css,/#customerModal[\s\S]*display:none/i);
});

test('calendar remains outside this refinement',()=>{
  const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(stripped,/(^|[\s,{])\.calendar\b/m);
  assert.doesNotMatch(stripped,/(^|[\s,{])\.day\b/m);
});
