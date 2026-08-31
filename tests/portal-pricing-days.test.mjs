import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../resort/portal-pricing-days.js',import.meta.url),'utf8');
const marker='const HIJRI_NUMERIC_FORMATTER';
const markerIndex=source.indexOf(marker);
assert.notEqual(markerIndex,-1,'pricing classifier marker must remain present');
const classifierSource=`${source.slice(0,markerIndex)}\n})();`;

function loadClassifier(contextOverrides={}){
  const context={window:{},...contextOverrides};
  vm.createContext(context);
  vm.runInContext(classifierSource,context);
  return {context,classify:context.window.isPortalHighDemandDay};
}

test('customer portal prices Thursday and Friday as high-demand days only',()=>{
  const {classify}=loadClassifier();
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
  const legacy=()=>false;
  const {context}=loadClassifier({isWeekend:legacy});
  assert.notEqual(context.isWeekend,legacy);
  assert.equal(context.isWeekend(new Date('2026-08-13T12:00:00')),true);
  assert.equal(context.isWeekend(new Date('2026-08-15T12:00:00')),false);
});
