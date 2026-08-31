import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('backup-flow-reliability.js','utf8');
const loader=fs.readFileSync('portal-dedicated-backend-compat.js','utf8');

test('manual backup verifies the stored browser copy after saving it',()=>{
  assert.match(source,/activeDataProtectionProvider\(\)\.save\(vaultRecord\)/);
  assert.match(source,/verifyStoredBackupRecord\(id\)/);
  assert.match(source,/activeDataProtectionProvider\(\)\.get\(id\)/);
  assert.match(source,/verifyBackupPayload\(envelope\)/);
});

test('backup success is separated from Supabase metadata sync failure',()=>{
  assert.match(source,/persistBackupMetadata/);
  assert.match(source,/النسخة نفسها سليمة، لكن تعذر مزامنة سجلها مع Supabase الآن/);
  assert.match(source,/النسخة الاحتياطية محفوظة محليًا، لكن سجل النسخة لم يتزامن مع Supabase/);
  assert.doesNotMatch(source,/تعذر مزامنة آخر تعديل\. تحقق من الاتصال وصلاحيات حساب المدير/);
});

test('backup has a safe fallback when browser vault storage is unavailable',()=>{
  assert.match(source,/download\(fileName,json,'application\/json'\)/);
  assert.match(source,/تم تجهيز ملف تنزيل بديل/);
  assert.match(source,/const rollbackReady=stored\|\|fileSaved/);
});

test('backup path requests persistent browser storage when supported',()=>{
  assert.match(source,/navigator\.storage\?\.persist/);
  assert.match(source,/requestPersistentBackupStorage\(\)/);
});

test('official runtime loads the reliable backup layer',()=>{
  assert.match(loader,/backup-flow-reliability\.js\?v=20260831-1/);
});
