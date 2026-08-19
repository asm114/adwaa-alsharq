import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('حذف تشييك العامل يمسح الوسائط ويترك علامة تمنع رجوع التنبيه',async()=>{
  const js=await read('worker-check-delete.js');
  assert.match(js,/dataset\.workerCheckDelete/);
  assert.match(js,/حذف تشييك العامل نهائيًا/);
  assert.match(js,/storage\.from\(BUCKET\)\.remove\(paths\)/);
  assert.match(js,/status:'reviewed'/);
  assert.match(js,/issue_types:\[\],photo_paths:\[\],voice_path:''/);
  assert.match(js,/shared_at:row\.shared_at\|\|now/);
  assert.match(js,/لن يعود التنبيه لهذا الحجز/);
  assert.match(js,/isDeletedMarker/);
  assert.match(js,/window\.location\.reload\(\)/);
});

test('واجهة الحذف تُحمّل بنسخة محدثة مع تشييك العامل',async()=>{
  const cleanup=await read('worker-check-legacy-cleanup.js');
  assert.match(cleanup,/worker-check-delete\.js\?v=20260819-2/);
});

test('قاعدة البوابة تسمح بالحذف للمدير فقط',async()=>{
  const sql=await read('supabase/migrations/20260819093000_customer_portal_worker_check_delete.sql');
  assert.match(sql,/grant delete on public\.customer_portal_worker_checks to authenticated/);
  assert.match(sql,/create policy "admins delete worker checks"/);
  assert.match(sql,/for delete/);
  assert.match(sql,/using \(public\.is_resort_admin\(\)\)/);
});
