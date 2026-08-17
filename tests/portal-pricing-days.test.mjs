import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../resort/portal-pricing-days.js',import.meta.url),'utf8');

function loadClassifier(){
  const context={window:{}};
  vm.createContext(context);
  vm.runInContext(source,context);
  return context.window.isPortalHighDemandDay;
}

test('customer portal prices Thursday and Friday as high-demand days only',()=>{
  const classify=loadClassifier();
  assert.equal(typeof classify,'function');
  assert.equal(classify(new Date('2026-08-13T12:00:00')),true,'Thursday must use high-demand price');
  assert.equal(classify(new Date('2026-08-14T12:00:00')),true,'Friday must use high-demand price');
  assert.equal(classify(new Date('2026-08-15T12:00:00')),false,'Saturday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-16T12:00:00')),false,'Sunday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-17T12:00:00')),false,'Monday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-18T12:00:00')),false,'Tuesday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-19T12:00:00')),false,'Wednesday must use normal weekday price');
});

test('pricing override replaces the legacy portal isWeekend function',()=>{
  const context={window:{},isWeekend:()=>false};
  vm.createContext(context);
  vm.runInContext(source,context);
  assert.equal(context.isWeekend(new Date('2026-08-13T12:00:00')),true);
  assert.equal(context.isWeekend(new Date('2026-08-15T12:00:00')),false);
});
