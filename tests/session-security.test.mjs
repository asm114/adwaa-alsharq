import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(html,/let db=emptyDatabase\(\)/,'must start with an empty in-memory database');
assert.doesNotMatch(html,/let db=readLocalDB\(\)/,'must not load local admin data before authentication');
assert.match(html,/db=normalizeDB\(readLocalDB\(\)\|\|emptyDatabase\(\)\)/,'local data must load only after a valid user is present');
assert.match(html,/function showLogin\(\)\{[\s\S]*?db=emptyDatabase\(\)/,'sign-out must clear sensitive in-memory state');
assert.match(html,/clearGoogleDriveSession\('signed-out'\)/,'sign-out must clear the Google access token');
assert.match(html,/const IDLE_LOCK_MS=30\*60\*1000/,'idle lock must be enabled');
assert.match(html,/retainOfflineDataToggle/,'offline retention must be an explicit setting');
assert.match(html,/localStorage\.removeItem\('adwaaDB'\)/,'logout must support removing local admin data');
assert.doesNotMatch(html,/localStorage\.(?:setItem|getItem)\([^\\n]*(?:googleDriveAccessToken|access_token)/i,'Google access token must not be stored persistently');

console.log('session-security: ok');
