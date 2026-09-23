const assert=require('node:assert/strict');
const test=require('node:test');
const core=require('../operational-alert-core.js');

test('AD-0075 does not regain a worker alert after a later financial update',()=>{
  const booking={id:'AD-0075',date:'2026-09-03',status:'تم الخروج',updatedAt:'2026-09-22T16:00:00Z'};
  assert.equal(core.workerShareEligible(booking,{exitDate:'2026-09-03',today:'2026-09-22',hour:12}),false);
});

test('worker share alert is eligible only on the actual exit day after 06:00',()=>{
  const booking={date:'2026-09-22',status:'تم الخروج'};
  assert.equal(core.workerShareEligible(booking,{exitDate:'2026-09-22',today:'2026-09-22',hour:5}),false);
  assert.equal(core.workerShareEligible(booking,{exitDate:'2026-09-22',today:'2026-09-22',hour:6}),true);
  assert.equal(core.workerShareEligible({...booking,status:'مؤكد'},{exitDate:'2026-09-22',today:'2026-09-22',hour:12}),false);
});
