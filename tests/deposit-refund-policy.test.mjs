import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('ملف سياسة العربون صالح نحويًا ومحمل بالنسخة الحالية',async()=>{
  const policy=await read('deposit-refund-policy.js');
  const loader=await read('subscription-booking-type.js');
  const index=await read('index.html');
  assert.doesNotThrow(()=>new vm.Script(policy));
  assert.match(loader,/deposit-refund-policy\.js\?v=20260918-2/);
  assert.match(index,/deposit-refund-policy\.js\?v=20260918-2/);
});

test('السياسة المعتمدة تحول إلغاء العميل إلى رصيد وتمنع وصف الاسترداد النقدي له',async()=>{
  const js=await read('deposit-refund-policy.js');
  assert.match(js,/العربون غير مسترد نقدًا، وفي حال إلغاء الحجز يُحفظ كامل مبلغ العربون كرصيد للعميل لاستخدامه في حجز لاحق/);
  assert.match(js,/إذا ألغى المنتجع الحجز، يكون للعميل خيار استرجاع المبلغ أو إبقائه رصيدًا/);
  assert.doesNotMatch(js,/إرجاع جزئي/);
});

test('واجهة الإلغاء تفرض الرصيد لإلغاء العميل وتعرض خيار الاسترجاع فقط لإلغاء المنتجع',async()=>{
  const index=await read('index.html');
  assert.match(index,/id="depositCancellationBy"/);
  assert.match(index,/value="customer">العميل/);
  assert.match(index,/value="resort">المنتجع/);
  assert.match(index,/cancellationAction\.disabled=cancelledBy!=='resort'/);
  assert.match(index,/if\(cancelledBy!=='resort'\)cancellationAction\.value='credit'/);
  assert.match(index,/const action=cancelledBy==='resort'\?\(document\.getElementById\('depositCancellationAction'\)\?\.value\|\|'credit'\):'credit'/);
});

test('تحويل العربون إلى رصيد يتم داخل حفظ الحجز ويحتفظ بجهة الإلغاء',async()=>{
  const index=await read('index.html');
  assert.match(index,/function creditCancelledDeposit\(booking,oldBooking,action,cancelledBy='customer'\)/);
  assert.match(index,/const finalAction=cancelledBy==='resort'&&action==='refund'\?'refund':'credit'/);
  assert.match(index,/booking\.depositCancellation=\{status:finalAction==='refund'\?'refunded':'credit',cancelledBy/);
  assert.match(index,/db\.customerCredits=core\.addCreditOnce/);
});

test('سجل الدفع الأصلي لا يُحذف أو يُنقص عند إنشاء رصيد العميل',async()=>{
  const core=await read('customer-credit-core.js');
  const index=await read('index.html');
  assert.doesNotMatch(core,/booking\.paid\s*=/);
  assert.doesNotMatch(core,/payments\.splice/);
  assert.match(index,/customerCreditApplied/);
  assert.match(index,/customerCredits/);
});

test('استخدام رصيد العميل لا يُحسب كتحصيل نقدي جديد',async()=>{
  const core=await read('customer-credit-core.js');
  const index=await read('index.html');
  assert.match(core,/return Math\.max\(0,safeNumber\(booking\?\.paid\)-safeNumber\(booking\?\.customerCreditApplied\)\)/);
  assert.match(index,/const cashCollected=activeBookings\.reduce/);
  assert.match(index,/finCashCollected/);
  assert.match(index,/finCustomerCredits/);
});

test('التغيير لا يحتوي SQL أو schema أو كتابة Supabase مباشرة',async()=>{
  const js=await read('deposit-refund-policy.js');
  const core=await read('customer-credit-core.js');
  assert.doesNotMatch(js,/supabase\.from/i);
  assert.doesNotMatch(core,/supabase\.from/i);
  assert.doesNotMatch(js,/create table/i);
  assert.doesNotMatch(core,/alter table/i);
});
