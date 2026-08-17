import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../app-experience-pro.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('professional app experience is isolated to visual styling',()=>{
  assert.match(css,/body\.simplified-ui/);
  assert.doesNotMatch(css,/supabase|localStorage|customer_portal|booking_id|persist\s*\(/i);
  assert.match(loader,/app-experience-pro\.css\?v=20260817-1/);
});

test('mobile app experience protects touch, safe areas, and iOS form zoom',()=>{
  assert.match(css,/--app-tap:48px/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/font-size:16px!important/);
  assert.match(css,/touch-action:manipulation/);
});

test('app experience supports reduced motion and clear keyboard focus',()=>{
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/:focus-visible/);
});
