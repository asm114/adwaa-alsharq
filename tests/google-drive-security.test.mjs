import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(html,/GOOGLE_DRIVE_RETRYABLE_STATUS=new Set\(\[408,429,500,502,503,504\]\)/);
assert.match(html,/if\(response\.status===401\)\{[\s\S]*?clearGoogleDriveSession\('unauthorized'\)/,'401 must clear the in-memory token');
assert.match(html,/if\(response\.status===403\)throw googleDriveError/,'403 must be handled without clearing the session');
assert.doesNotMatch(html,/response\.status===401\|\|response\.status===403/,'401 and 403 must not share destructive session handling');
assert.match(html,/AbortController\(\)/,'Drive requests must be abortable');
assert.match(html,/GOOGLE_DRIVE_REQUEST_TIMEOUT_MS/,'Drive requests must have a unified timeout');
assert.match(html,/if\(!isRetryableGoogleError\(lastError\)\|\|attempt===GOOGLE_DRIVE_MAX_RETRIES\)throw/,'non-transient errors must not be retried');
assert.match(html,/if\(googleDriveConnectPromise\)return googleDriveConnectPromise/,'concurrent connect flows must be coalesced');
assert.match(html,/if\(googleDriveUploadInProgress\)/,'concurrent uploads must remain blocked');
assert.match(html,/declaredSize>MAX_BACKUP_FILE_BYTES/,'cloud downloads must enforce backup size before parsing');
assert.match(html,/function safeExternalError/,'external API messages must be sanitized');
assert.doesNotMatch(html,/xhr\.responseText\|\|'استجابة غير معروفة'/,'raw upload API responses must not reach users');

console.log('google-drive-security: ok');
