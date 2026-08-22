import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../luxe-controls.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('luxe controls load after the visual layers',()=>{
  assert.match(loader,/luxe-controls\.css\?v=20260822-1/);
  assert.match(loader,/dataset\.luxeControls/);
  assert.ok(loader.indexOf('luxe-controls.css')>loader.indexOf('home-metric-drilldowns.js'));
});

test('legacy button identity is replaced by navy gold controls',()=>{
  assert.match(css,/button\.primary/);
  assert.match(css,/--luxe-control-ink:#0b1423/);
  assert.match(css,/--luxe-control-gold:#d7a84a/);
  assert.match(css,/button\.secondary/);
  assert.match(css,/home-secondary-details/);
});

test('control layer is visual only and leaves calendar untouched',()=>{
  const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(stripped,/supabase|localStorage|persist\s*\(|booking_id|customer_portal/i);
  assert.doesNotMatch(stripped,/(^|[\s,{])\.calendar\b/m);
  assert.doesNotMatch(stripped,/(^|[\s,{])\.day\b/m);
});
