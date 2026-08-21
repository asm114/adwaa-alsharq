import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../luxe-trial-theme.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('luxe trial theme is loaded as a reversible visual layer',()=>{
  assert.match(loader,/luxe-trial-theme\.css\?v=20260821-1/);
  assert.match(loader,/dataset\.luxeTrialTheme/);
  assert.doesNotMatch(css,/supabase|localStorage|customer_portal|booking_id|persist\s*\(/i);
});

test('luxe trial theme deliberately leaves calendar implementation untouched',()=>{
  assert.doesNotMatch(css,/(^|[\s,{])\.calendar\b/m);
  assert.doesNotMatch(css,/(^|[\s,{])\.day\b/m);
  assert.match(css,/Calendar guardrail/);
});

test('trial theme includes dark chrome and mobile adaptation',()=>{
  assert.match(css,/--luxe-ink:#09111f/);
  assert.match(css,/body\.simplified-ui nav/);
  assert.match(css,/@media\(max-width:620px\)/);
});
