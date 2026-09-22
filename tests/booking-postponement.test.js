'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const postponed=require('../booking-postponement.js');

test('تأجيل الحجز يحرر التاريخ ويحفظ مرجعه والدفعات',()=>{
  const old={id:'AD-0026',status:'ملغي',date:'2026-09-25',total:600,paid:600,payments:[{id:'p1',amount:600}]};
  const next=postponed.prepareForSave(old,{...old,status:'مؤجل'},'2026-09-22T08:00:00.000Z');
  assert.equal(next.date,'');
  assert.equal(next.postponedFromDate,'2026-09-25');
  assert.equal(next.postponedAt,'2026-09-22T08:00:00.000Z');
  assert.deepEqual(next.payments,old.payments);
});

test('إعادة تفعيل المؤجل تتطلب موعدًا جديدًا',()=>{
  const old={status:'مؤجل',date:'',postponedFromDate:'2026-09-25',paid:600};
  assert.throws(()=>postponed.prepareForSave(old,{...old,status:'مؤكد'},'2026-10-01T08:00:00.000Z'),/حدد موعدًا جديدًا/);
  const next=postponed.prepareForSave(old,{...old,status:'مؤكد',date:'2026-12-10'},'2026-10-01T08:00:00.000Z');
  assert.equal(next.date,'2026-12-10');
  assert.equal(next.resumedAt,'2026-10-01T08:00:00.000Z');
});
