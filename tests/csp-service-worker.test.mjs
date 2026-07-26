import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const cleaner=fs.readFileSync(new URL('../cleaner.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

for(const [name,html] of [['index',index],['cleaner',cleaner]]){
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/object-src 'none'/);
  assert.match(html,/base-uri 'none'/);
  assert.match(html,/upgrade-insecure-requests/);
  assert.doesNotMatch(html,/supabase-js@2["/]/,`${name} must not use a floating Supabase major`);
  assert.match(html,/supabase-js@2\.106\.2/);
  assert.match(html,/integrity="sha384-/);
}
assert.match(sw,/adwaa-v9\.7-security-hardening-1/);
assert.doesNotMatch(sw,/adwaa-v9\.6-rc1/);
assert.match(sw,/CACHEABLE_PATHS\.has/,'service worker cache must use an allowlist');
assert.match(sw,/fetch\(event\.request,\{cache:'no-store'\}\)/);

console.log('csp-service-worker: ok');
