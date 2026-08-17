import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../portal-final-admin.js',import.meta.url),'utf8');

test('admin shell is hidden and inert until a manager session is confirmed',()=>{
  assert.match(source,/root\.hidden=true/);
  assert.match(source,/root\.inert=true/);
  assert.match(source,/root\.setAttribute\('aria-hidden','true'\)/);
  assert.match(source,/portalAdminRequireSession/);
});

test('portal feedback and activity are protected by manager authentication',()=>{
  assert.match(source,/async function loadPortalFeedback\(\)[\s\S]*portalAdminRequireSession/);
  assert.match(source,/async function loadPortalActivityLog\(\)[\s\S]*portalAdminRequireSession/);
  assert.match(source,/async function exportCustomerPortalBackup\(\)[\s\S]*portalAdminRequireSession\(\{silent:false\}\)/);
});

test('portal data bootstrap uses protected loader instead of unconditional reads',()=>{
  assert.match(source,/DOMContentLoaded[^\n]*loadProtectedPortalAdminData/);
  assert.doesNotMatch(source,/DOMContentLoaded[^\n]*loadPortalFinalSummary\(\);loadPortalFeedback\(\);loadPortalActivityLog\(\)/);
});
