import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cleaner = readFileSync(new URL('../cleaner.html', import.meta.url), 'utf8');
const cleanerSql = readFileSync(new URL('../supabase-cleaner-security.sql', import.meta.url), 'utf8');

assert.doesNotMatch(cleaner, /\.from\(['"]app_state['"]\)/, 'بوابة العامل يجب ألا تقرأ app_state مباشرة');
assert.doesNotMatch(cleaner, /\.upsert\(\{id:ROW_ID,data:db/, 'بوابة العامل يجب ألا تكتب app_state كاملًا');
assert.match(cleaner, /rpc\(['"]cleaner_get_task['"]/, 'قراءة المهمة يجب أن تمر عبر RPC');
assert.match(cleaner, /rpc\(['"]cleaner_update_task['"]/, 'تحديث المهمة يجب أن يمر عبر RPC');
assert.match(cleaner, /TOKEN_PATTERN=\/\^\[0-9a-f\]\{32\}\$\//, 'يجب التحقق من صيغة token قبل الطلب');
assert.match(cleanerSql, /revoke all on table public\.app_state from anon/i);
assert.match(cleanerSql, /security definer/i);
assert.match(cleanerSql, /owner_id = auth\.uid\(\)/i);
assert.match(index, /accessExpiresAt:cleanerAccessExpiry\(\)/);

console.log('security-static: cleaner isolation checks passed');
