import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('حذف تشييك العامل متاح للمدير ويحذف السجل ووسائطه',async()=>{
  const js=await read('worker-check-delete.js');
  assert.match(js,/dataset\.workerCheckDelete/);
  assert.match(js,/حذف تشييك العامل نهائيًا/);
  assert.match(js,/\.from\(TABLE\)\.delete\(\)\.eq\('id',row\.id\)/);
  assert.match(js,/storage\.from\(BUCKET\)\.remove\(paths\)/);
  assert.match(js,/window\.location\.reload\(\)/);
  assert.match(js,/\['ready','submitted','reviewed'\]/);
});

test('واجهة الحذف تُحمّل مع تشييك العامل',async()=>{
  const cleanup=await read('worker-check-legacy-cleanup.js');
  assert.match(cleanup,/worker-check-delete\.js\?v=20260819-1/);
});

test('قاعدة البوابة تسمح بالحذف للمدير فقط',async()=>{
  const sql=await read('supabase/migrations/20260819093000_customer_portal_worker_check_delete.sql');
  assert.match(sql,/grant delete on public\.customer_portal_worker_checks to authenticated/);
  assert.match(sql,/create policy "admins delete worker checks"/);
  assert.match(sql,/for delete/);
  assert.match(sql,/using \(public\.is_resort_admin\(\)\)/);
});
