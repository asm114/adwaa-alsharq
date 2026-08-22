import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const indexSource=await read('index.html');

test('main administration script remains syntactically valid',()=>{
  const match=indexSource.match(/<script>\s*(const \{url:SUPABASE_URL[\s\S]*?)<\/script>/);
  assert.ok(match,'main inline script must be found');
  assert.doesNotThrow(()=>Function(match[1]));
});

test('backup validation rejects executable markup, unsafe identifiers, and unsafe image URLs',()=>{
  const start=indexSource.indexOf('const BACKUP_MAX_FILE_BYTES=');
  const end=indexSource.indexOf('function backupCoreData()',start);
  assert.ok(start>0&&end>start,'backup validation helper block must exist');
  const helpers=Function(`${indexSource.slice(start,end)};return {assertSafeBackupValue,isSafeBackupImageDataUrl};`)();
  assert.doesNotThrow(()=>helpers.assertSafeBackupValue({bookings:[{id:'550e8400-e29b-41d4-a716-446655440000',name:'عميل آمن',photos:[{dataUrl:'data:image/png;base64,AA=='}]}]}));
  assert.throws(()=>helpers.assertSafeBackupValue({bookings:[{name:'<img src=x onerror=alert(1)>'}]}),/HTML/);
  assert.throws(()=>helpers.assertSafeBackupValue({bookings:[{id:"x' onclick='alert(1)"}]}),/معرّف/);
  assert.throws(()=>helpers.assertSafeBackupValue({bookings:[{photos:[{dataUrl:'javascript:alert(1)'}]}]}),/صورة/);
  assert.equal(helpers.isSafeBackupImageDataUrl('data:image/webp;base64,AA=='),true);
});

test('backup envelope and file size are constrained before restore',()=>{
  assert.match(indexSource,/BACKUP_MAX_FILE_BYTES=25\*1024\*1024/);
  assert.match(indexSource,/envelope\.recoveryId!==undefined&&!BACKUP_RECOVERY_ID\.test/);
  assert.match(indexSource,/file\.size>BACKUP_MAX_FILE_BYTES/);
  assert.match(indexSource,/assertSafeBackupValue\(data\)/);
});

test('manager cache is authorized before rendering and cleared on logout',()=>{
  const showStart=indexSource.indexOf('async function showApplication(user)');
  const showEnd=indexSource.indexOf('async function loginManager',showStart);
  const show=indexSource.slice(showStart,showEnd);
  assert.ok(show.indexOf('await loadRemoteData({render:false})')<show.indexOf("classList.remove('auth-locked')"));
  assert.ok(show.indexOf('await loadRemoteData({render:false})')<show.indexOf('renderAll()'));
  assert.match(show,/ownerMatches[\s\S]*!authorized&&\(!ownerMatches\|\|lastRemoteLoadDenied\)/);
  assert.match(indexSource,/function clearSensitiveLocalState\(\)[\s\S]*localStorage\.removeItem\('adwaaDB'\)[\s\S]*localStorage\.removeItem\(MANAGER_CACHE_OWNER_KEY\)[\s\S]*db=createEmptyDB\(\)/);
  assert.match(indexSource,/localStorage\.setItem\(MANAGER_CACHE_OWNER_KEY,String\(currentUser\.id\)\)/);
  assert.match(indexSource,/lastRemoteLoadDenied=denied/);
  assert.match(indexSource,/async function logoutManager\(\)[\s\S]*showLogin\(\);\s*clearSensitiveLocalState\(\)/);
});

test('CSV values neutralize spreadsheet formula prefixes without changing ordinary text',()=>{
  const declaration=indexSource.match(/function csvSafeCell\(value\)\{[^\n]+\}/)?.[0];
  assert.ok(declaration);
  const csvSafeCell=Function(`${declaration};return csvSafeCell;`)();
  for(const value of ['=1+1','+cmd','-10+20','@SUM(A1:A2)','  =HYPERLINK("https://example.test")'])assert.ok(csvSafeCell(value).startsWith("'"));
  assert.equal(csvSafeCell('عميل عادي'),'عميل عادي');
  assert.equal(csvSafeCell(125), '125');
  assert.match(indexSource,/csvSafeCell\(v\)\.replaceAll/);
});

test('generated document JavaScript escapes script-ending characters',async()=>{
  for(const path of ['document-preview-controls.js','generated-document-toolbar.js']){
    const source=await read(path);
    const declaration=source.match(/function escJs\(value\)\{[^\n]+\}/)?.[0];
    assert.ok(declaration,`${path} must define escJs`);
    const escJs=Function(`${declaration};return escJs;`)();
    const encoded=escJs('</script><script>alert(1)</script>');
    assert.doesNotMatch(encoded,/<\/script>/i);
    assert.match(encoded,/\\u003c/);
  }
});

test('Supabase browser dependency is pinned to the reviewed exact release',async()=>{
  const paths=['index.html','cleaner.html','resort/index.html','resort/feedback.html','resort/preview.html','backup-before-v9.5-RC1-2026-07-22.html','index-v9.0-before-RC1.html'];
  for(const path of paths){
    const source=await read(path);
    assert.match(source,/@supabase\/supabase-js@2\.111\.0/);
    assert.doesNotMatch(source,/@supabase\/supabase-js@2["/]/);
    assert.match(source,/integrity="sha384-fPWur1rx\/DE6YtXP\/x0MD6dd90RgnVsz5yX\/DIg7CcVAnTBZsENWuIcpvVTM39ti"/);
    assert.match(source,/crossorigin="anonymous"/);
  }
});
