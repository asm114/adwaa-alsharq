import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('app state preserves the resort account and loads the cash ledger core',async()=>{
  const html=await read('index.html');
  assert.match(html,/resortAccount:\{calibration:null,financialRepairVersion:0,manualMovements:\[\]\}/);
  assert.match(html,/ResortAccountCore\?\.normalizeAccount\(x\.resortAccount\)/);
  assert.match(html,/resort-account-core\.js\?v=20260920-1/);
});

test('every saved expense is positive and expense categories cover resort operations',async()=>{
  const html=await read('index.html');
  assert.match(html,/أدخل مبلغ مصروف أكبر من صفر/);
  for(const category of ['إنترنت واتصالات','رواتب وأجور','وقود ونقل','تسويق وإعلانات','مسبح','حدائق وزراعة','أثاث وتجهيزات','رسوم حكومية وتراخيص','عمولات منصات']){
    assert.ok(html.includes(category),category);
  }
});

test('customer credit and payment history agree on paid = cash + applied credit',async()=>{
  const html=await read('index.html');
  const payments=await read('booking-payment-history.js');
  assert.match(html,/cashPaid=Math\.max\(0,enteredPaid-requestedCredit\)/);
  assert.doesNotMatch(html,/enteredPaid-priorApplied/);
  assert.match(payments,/booking\.paid=paymentSum\(payments\)\+safeNumber\(booking\.customerCreditApplied\)/);
  assert.match(payments,/cashPaid=paymentSum\(paymentDraft\),credit=safeNumber\(document\.getElementById\('customerCreditUse'\)\?\.value\),paid=cashPaid\+credit/);
});

test('resort account UI shows available balance and cash outflow and supports calibration',async()=>{
  const js=await read('resort-account-balance.js');
  assert.match(js,/الرصيد المتاح في حساب المنتجع/);
  assert.match(js,/الخارج من حساب المنتجع/);
  assert.match(js,/ضبط الرصيد الحالي/);
  assert.match(js,/Core\.customerCashCollected/);
  assert.match(js,/Core\.cashOutflow/);
  assert.match(js,/financialRepairVersion/);
});

test('refunds commissions expenses and advances feed the balance without changing profit semantics',async()=>{
  const core=await read('resort-account-core.js');
  const notes=await read('accounting-notes.js');
  assert.match(core,/kind:'customer_refund'/);
  assert.match(core,/kind:'commission_transfer'/);
  assert.match(core,/kind:'expense'/);
  assert.match(core,/kind:'personal_advance'/);
  assert.match(core,/kind:'advance_repayment'/);
  assert.match(notes,/ليست مصروفًا ولا تغيّر صافي الربح/);
  assert.match(notes,/تخصم من رصيد حساب المنتجع/);
  assert.match(notes,/كل سداد يعيد المبلغ إلى الرصيد تلقائيًا/);
});

test('finance loader brings the resort balance after commission workflow',async()=>{
  const loader=await read('subscription-booking-type.js');
  const commission=loader.indexOf('commission-transfer-workflow.js?v=20260813-2');
  const account=loader.indexOf('resort-account-balance.js?v=20260921-1');
  assert.ok(commission>=0);
  assert.ok(account>commission);
});


test('cancellation settles all cash actually received without deleting the payment history',async()=>{
  const html=await read('index.html');
  assert.match(html,/const cashPaid=core\.cashCollected\(financialSource\)/);
  assert.match(html,/const settlementAmount=typeof core\.cancellationSettlement==='function'\?core\.cancellationSettlement\(financialSource\):cashPaid/);
  assert.match(html,/refundAmount:finalAction==='refund'\?settlementAmount:0/);
});


test('finance repair v2 restores paid total from explicit cash payments plus applied customer credit',async()=>{
  const js=await read('resort-account-balance.js');
  assert.match(js,/financialRepairVersion>=2/);
  assert.match(js,/expected=cash\+credit/);
  assert.match(js,/booking\.paid=expected/);
  assert.match(js,/financialRepairVersion=2/);
});
