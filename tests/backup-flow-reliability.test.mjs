import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
  assert.equal((fs.readFileSync('index.html','utf8').match(/<script src="backup-flow-reliability\.js/g)||[]).length,1);
  assert.match(fs.readFileSync('index.html','utf8'),/<script src="backup-flow-reliability\.js\?v=20261023-drive-1"><\/script>/);
  assert.match(loader,/backup-flow-reliability\.js\?v=20261023-drive-1/);
});

function fallbackHarness(){
 const c={Blob,navigator:{},currentUser:{id:'synthetic'},db:{bookings:[],expenses:[],backupHistory:[]},download(){},console:{warn(){},error(){}},createBackupEnvelope:async()=>({recoveryId:'synthetic-backup',createdAt:'2026-10-23T00:00:00Z'}),verifyBackupPayload:async()=>({summary:{bookings:0},relationships:{warnings:[]}}),backupFileName:()=> 'synthetic.json',activeDataProtectionProvider:()=>({save:async()=>{throw Error('quota')},get:async()=>null}),addAudit(){},APP_VERSION:'test',DATA_PROTECTION_PROVIDER_ID:'local',normalizeDB:x=>x,invalidateCaches(){},scheduleRenderAll(){},persist:async()=>true,syncBackupToGoogleDrive:async()=>({ok:false,skipped:true}),renderBackupHistory(){},renderBackupManagement(){},renderDataProtectionCenter(){},setBackupOperationMessage(){},formatBytes:x=>String(x),alert(){}};
 c.window=c;vm.runInNewContext(source,c);return c;
}
test('download request alone never confirms a saved file or rollback readiness',async()=>{
 const c=fallbackHarness();const result=await c.createBackup('manual',{preferDirectory:false});
 assert.equal(result.stored,false);assert.equal(result.downloadRequested,true);assert.equal(result.fileSaved,false);assert.equal(result.rollbackReady,false);
});
test('automatic safety backup rejects when only an unconfirmed download is available',async()=>{
 const c=fallbackHarness();await assert.rejects(c.createBackup('before-change',{preferDirectory:false,silent:true}),/لم ينجح حفظ نسخة/);
 assert.equal(c.db.backupHistory.length,0);
});
