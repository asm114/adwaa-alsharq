import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../customer-directory-v2.css',import.meta.url),'utf8');
const js=await readFile(new URL('../customer-directory-trial.js',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('customer directory v2 is loaded as isolated trial assets',()=>{
  assert.match(loader,/customer-directory-v2\.css\?v=20260822-1/);
  assert.match(loader,/customer-directory-trial\.js\?v=20260822-1/);
});

test('customer list becomes names-first and full-row clickable',()=>{
  assert.match(css,/#customerList \.customer-stats[\s\S]*display:none!important/);
  assert.match(css,/#customerList \.actions[\s\S]*display:none!important/);
  assert.match(js,/primary\.click\(\)/);
  assert.match(js,/role','button/);
});

test('customer directory redesign does not touch calendar or persistence',()=>{
  const source=`${css}\n${js}`.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(source,/(^|[\s,{])\.calendar\b/m);
  assert.doesNotMatch(source,/(^|[\s,{])\.day\b/m);
  assert.doesNotMatch(source,/supabase|localStorage|persist\s*\(|booking_id|customer_portal/i);
});
