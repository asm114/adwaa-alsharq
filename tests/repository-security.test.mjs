import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'})
  .split('\0').filter(path => path && existsSync(new URL(path,root)));

const deployableBackups=tracked.filter(path =>
  /\.html$/i.test(path) && /(backup|before|old|copy|نسخ)/i.test(path)
);
assert.deepEqual(
  deployableBackups,
  [],
  'يجب ألا يحتوي GitHub Pages على نسخ HTML قديمة قابلة للتشغيل'
);

const textFiles=tracked.filter(path =>
  /\.(?:html|js|mjs|json|md|sql|css|yml|yaml|txt)$/i.test(path)
);
const findings=[];
const secretPatterns=[
  ['Supabase service_role key',/\bservice_role\b\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i],
  ['client secret',/\bclient_secret\b\s*[:=]\s*["'][^"'\s]{8,}/i],
  ['refresh token',/\brefresh_token\b\s*[:=]\s*["'][^"'\s]{8,}/i],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Supabase secret key',/\bsb_secret_[A-Za-z0-9_-]{12,}/],
  ['Google API key',/\bAIza[0-9A-Za-z_-]{30,}/],
];
for(const path of textFiles){
  const value=readFileSync(new URL(path,root),'utf8');
  for(const [label,pattern] of secretPatterns){
    if(pattern.test(value))findings.push(`${path}: ${label}`);
  }
}
assert.deepEqual(
  findings,
  [],
  `عُثر على نمط سر محتمل (القيمة محجوبة): ${findings.join(', ')}`
);

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.doesNotMatch(index,/console\.(?:log|error|warn)\([^)]*(?:access[_ ]?token|refresh[_ ]?token|password|customer|bookingData)/i);
assert.doesNotMatch(index,/console\.error\([^)]*,\s*(?:err|error)\b/i,'لا تسجل كائنات أخطاء API الخام');

console.log('repository-security: tracked artifacts and secret patterns passed');
