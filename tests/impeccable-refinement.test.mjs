import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../impeccable-refinement.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('Impeccable refinement remains visual-only and loads last',()=>{
  assert.match(loader,/impeccable-refinement\.css\?v=20260821-1/);
  assert.match(loader,/data-impeccable-refinement|dataset\.impeccableRefinement/);
  assert.doesNotMatch(css,/supabase|localStorage|customer_portal|booking_id|persist\s*\(/i);
});

test('direct movement alerts expose a strong one-tap action',()=>{
  assert.match(css,/action-alert\[data-operational-movement="1"\][\s\S]*button/);
  assert.match(css,/background:var\(--impeccable-green\)!important/);
  assert.match(css,/grid-column:1\/-1!important/);
});

test('phone and tablet adaptations preserve readable controls',()=>{
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/nav>button[\s\S]*font-size:11px!important/);
  assert.match(css,/@media\(min-width:621px\) and \(max-width:899px\)/);
  assert.match(css,/padding-inline:18px!important/);
  assert.match(css,/@media\(hover:none\)/);
});
