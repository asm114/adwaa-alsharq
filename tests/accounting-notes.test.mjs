import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('app_state preserves resort accounting notes',async()=>{
  const html=await read('index.html');
  assert.match(html,/accountingNotes:\[\]/);
  assert.match(html,/accountingNotes:Array\.isArray\(x\.accountingNotes\)\?x\.accountingNotes:\[\]/);
  assert.match(html,/accounting-notes\\.js\\?v=20260920-2/);
});

test('accounting notes are separate from resort expenses and profit',async()=>{
  const js=await read('accounting-notes.js');
  assert.match(js,/ليست مصروفًا ولا تغيّر صافي الربح/);
  assert.match(js,/تخصم من رصيد حساب المنتجع/);
  assert.match(js,/كل سداد يعيد المبلغ إلى الرصيد تلقائيًا/);
  assert.doesNotMatch(js,/db\.expenses\.push/);
  assert.doesNotMatch(js,/finProfit/);
});

test('repayment ledger recalculates paid and remaining automatically',async()=>{
  const js=await read('accounting-notes.js');
  assert.match(js,/function summary\(note\)/);
  assert.match(js,/reduce\(\(sum,row\)=>sum\+row\.amount,0\)/);
  assert.match(js,/remaining:Math\.max\(0,principal-paid\)/);
  assert.match(js,/إجمالي ما تم سداده/);
  assert.match(js,/المتبقي لحساب المنتجع/);
});

test('repayments can be added edited and deleted with notes and date',async()=>{
  const js=await read('accounting-notes.js');
  assert.match(js,/function openPayment\(noteId,paymentId=''/);
  assert.match(js,/async function saveAccountingPayment/);
  assert.match(js,/async function deletePayment/);
  assert.match(js,/name="date"/);
  assert.match(js,/ملاحظة السداد/);
  assert.match(js,/تعديل/);
  assert.match(js,/حذف/);
});

test('guards prevent overpayment and principal below paid total',async()=>{
  const js=await read('accounting-notes.js');
  assert.match(js,/principalAmount\+0\.009<alreadyPaid/);
  assert.match(js,/otherPaid\+amount>principal\+0\.009/);
  assert.match(js,/السداد يتجاوز المتبقي/);
  assert.match(js,/أصل المبلغ أقل من إجمالي ما تم سداده/);
});

test('accounting changes are audited and persisted through the resort state',async()=>{
  const js=await read('accounting-notes.js');
  assert.match(js,/addAudit/);
  assert.match(js,/persist/);
  assert.match(js,/ملاحظة حسابية/);
  assert.match(js,/سداد ملاحظة حسابية/);
  assert.doesNotMatch(js,/window\.db/);
});
