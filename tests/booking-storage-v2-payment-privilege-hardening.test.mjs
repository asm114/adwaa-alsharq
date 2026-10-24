import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const migration='supabase/migrations/20260916110000_booking_storage_v2_payment_privilege_hardening.sql';
const read=path=>readFile(new URL(path,root),'utf8');

test('payment privilege hardening revokes mutation rights and keeps append/read',async()=>{
  const sql=await read(migration);
  assert.match(sql,/revoke update, delete on table public\.payments from authenticated/i);
  assert.match(sql,/grant select, insert on table public\.payments to authenticated/i);
});
