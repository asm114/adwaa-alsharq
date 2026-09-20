import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('expense sequence is persisted independently from visible records',()=>{
  assert.match(html,/expenses:\[\],expenseSeq:0/);
  assert.match(html,/expenseSeq:Math\.max\(0,Number\(x\.expenseSeq\|\|0\)\|\|0\)/);
  assert.match(html,/db\.expenseSeq=Math\.max\(Number\(db\.expenseSeq\|\|0\),expenseRefNumber\(item\.ref\)\)/);
});

test('deleted expense references are not silently reused',()=>{
  assert.match(html,/function expenseSequenceFloor\(\)/);
  assert.match(html,/filter\(x=>x\?\.entity==='مصروف'\)/);
  assert.match(html,/Math\.max\(0,Number\(db\.expenseSeq\|\|0\)\|\|0,current,audited\)/);
});

test('expense table sorts newest date then highest EXP reference',()=>{
  assert.match(html,/String\(b\.date\)\.localeCompare\(String\(a\.date\)\)\|\|expenseRefNumber\(b\.ref\)-expenseRefNumber\(a\.ref\)/);
});

test('Arabic number input helper is loaded before the main application logic',()=>{
  assert.match(html,/arabic-number-input\.js\?v=20260920-1/);
});
