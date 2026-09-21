import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const require=createRequire(import.meta.url);
const core=require(fileURLToPath(new URL('../booking-date-stability.js',import.meta.url)));

test('booking date accepts Arabic and Gregorian typing and normalizes to ISO',()=>{
  assert.equal(core.normalizeDate('٢٥/٩/٢٠٢٦'),'2026-09-25');
  assert.equal(core.normalizeDate('25/9/2026'),'2026-09-25');
  assert.equal(core.normalizeDate('2026-09-25'),'2026-09-25');
  assert.equal(core.normalizeDate('۳/۱۰/۲۰۲۶'),'2026-10-03');
});

test('booking date rejects impossible calendar dates',()=>{
  assert.equal(core.normalizeDate('٣١/٢/٢٠٢٦'),'');
  assert.equal(core.normalizeDate('2026-13-01'),'');
});

test('booking date helper provides manual Arabic entry and a separate native calendar picker',async()=>{
  const js=await readFile(new URL('../booking-date-stability.js',import.meta.url),'utf8');
  assert.match(js,/input\.type='text'/);
  assert.match(js,/input\.inputMode='numeric'/);
  assert.match(js,/اختيار من التقويم/);
  assert.match(js,/native\.type='date'/);
  assert.match(js,/addEventListener\('submit'/);
});
