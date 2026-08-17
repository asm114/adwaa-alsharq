import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

test('local assistant is removed from the rendered admin experience',()=>{
  assert.match(source,/getElementById\('localAssistantCard'\)\?\.remove\(\)/);
  assert.match(source,/window\.runLocalAssistant=undefined/);
  assert.match(source,/window\.parseAssistantDate=undefined/);
  assert.match(source,/window\.initRCCandidateUI=function\(\)/);
});
