'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../booking-financial-core.js');

const payment=(amount,id='p1',type='partial')=>({id,amount,type,method:'transfer',date:'2026-09-21'});

test('حجز 1000 ودفعة 500 ينتج متبقي 500',()=>{
  const booking={total:1000,paid:500,payments:[payment(500)]};
  assert.equal(core.settledAmount(booking),500);
  assert.equal(core.remainingAmount(booking),500);
});

test('حجز صالح 5600 ودفعة سابقة 3000 ينتج متبقي 2600',()=>{
  const booking={total:5600,paid:0,payments:[payment(3000,'f4866b9e-3289-41a9-8ddb-cd06859ba267','deposit')]};
  assert.equal(core.settledAmount(booking),3000);
  assert.equal(core.remainingAmount(booking),2600);
});

test('دفعات متعددة تجمع مرة واحدة والعربون القديم لا يضاعف المدفوع',()=>{
  const booking={total:5600,paid:3000,deposit:3000,payments:[payment(3000,'deposit','deposit'),payment(500,'later')]};
  assert.equal(core.paymentSum(booking),3500);
  assert.equal(core.settledAmount(booking),3500);
  assert.equal(core.remainingAmount(booking),2100);
});

test('تعديل الإجمالي يعيد حساب المتبقي دون تغيير الدفعات',()=>{
  const original={total:1000,payments:[payment(500)]};
  const changed={...original,total:1200};
  assert.deepEqual(changed.payments,original.payments);
  assert.equal(core.remainingAmount(changed),700);
});

test('الحجز المسدد بالكامل متبقيه صفر',()=>{
  assert.equal(core.remainingAmount({total:1000,payments:[payment(1000)]}),0);
});

test('الحجز الملغي لا يظهر تحصيلًا مستحقًا مع بقاء النقد المسجل',()=>{
  const booking={status:'ملغي',total:1000,paid:500,payments:[payment(500)]};
  assert.equal(core.remainingAmount(booking),0);
  assert.equal(core.paymentStatus(booking).code,'cancelled');
  assert.equal(core.cashReceived(booking),500);
});

test('رصيد العميل يدخل في التسوية ولا يدخل في النقد مرتين',()=>{
  const booking={total:1000,customerCreditApplied:200,payments:[payment(300)]};
  assert.equal(core.cashReceived(booking),300);
  assert.equal(core.settledAmount(booking),500);
  assert.equal(core.remainingAmount(booking),500);
});

test('تطبيق سجل الدفعات يستبدل التجميع القديم ولا يجمعه فوقه',()=>{
  const booking=core.applyPaymentLedger({total:1000,paid:900,customerCreditApplied:100},[payment(300)]);
  assert.equal(booking.paid,400);
  assert.equal(core.remainingAmount(booking),600);
});

test('نطاق حفظ النموذج صريح ومؤقت',()=>{
  assert.equal(core.isFormSaveActive(),false);
  core.withFormSaveScope(()=>assert.equal(core.isFormSaveActive(),true));
  assert.equal(core.isFormSaveActive(),false);
  assert.throws(()=>core.withFormSaveScope(()=>{throw new Error('stop')}),/stop/);
  assert.equal(core.isFormSaveActive(),false);
});
