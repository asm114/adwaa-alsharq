import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('مركز العقد يستخدم زر مشاركة ملف واحد ويوضح المستلم',async()=>{
  const js=await read('contract-one-button-share.js');
  assert.match(js,/contract-create/);
  assert.match(js,/contract-send/);
  assert.match(js,/contract-share-file/);
  assert.match(js,/مشاركة ملف العقد/);
  assert.match(js,/أرسل إلى:/);
  assert.match(js,/navigator\.canShare\(\{files:\[file\]\}\)/);
  assert.match(js,/navigator\.share\(\{title:`عقد \$\{name\}`/);
  assert.match(js,/v92RecordOperation\('contract','created'\)/);
  assert.match(js,/v92RecordOperation\('contract','sent'\)/);
});

test('تحميل مشاركة العقد بزر واحد مرتبط بتحسين المستند',async()=>{
  const js=await read('document-preview-controls.js');
  assert.match(js,/contract-one-button-share\.js\?v=20260819-1/);
});
