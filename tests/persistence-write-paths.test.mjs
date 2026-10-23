import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('active administrative writes have one atomic revision primitive and no upsert fallback',()=>{
 for(const name of ['index.html','backup-flow-reliability.js','cleaner.html','booking-save-direct-production.js','supabase-config.staging.js']){
  const code=read(name);assert.doesNotMatch(code,/from\(['"]app_state['"]\)[\s\S]{0,35}\.(update|upsert|insert)\(/,name);
 }
 const core=read('booking-persist-update-path.js');assert.match(core,/\.eq\('updated_at',base\)/);assert.doesNotMatch(core,/\.upsert\(/);
});
test('historical and generated preview snapshots cannot execute stale writers',()=>{
 for(const name of ['index-v9.0-before-RC1.html','backup-before-v9.5-RC1-2026-07-22.html','qa-app.html','qa-preview.html']){
  assert.match(read(name),/script-src 'none'; connect-src 'none'; form-action 'none'/,name);
 }
});
test('active administrative source never writes plaintext customer state to localStorage',()=>{
 for(const name of readdirSync(new URL('../',import.meta.url)).filter(x=>x.endsWith('.js'))){
  if(name==='local-data-protection.js')continue;
  assert.doesNotMatch(read(name),/localStorage\.setItem\('adwaaDB'/,name);
 }
 assert.doesNotMatch(read('index.html'),/localStorage\.setItem\('adwaaDB'/);
});
