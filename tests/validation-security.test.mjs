import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../security-validation.js',import.meta.url),'utf8');
const context={window:{}};
vm.createContext(context);
vm.runInContext(source,context);
const V=context.window.AdwaaValidation;

assert.ok(V);
assert.throws(()=>V.parseJson('{"__proto__":{"polluted":true}}'),/محظور/);
assert.throws(()=>V.parseJson('{"constructor":{"prototype":{"polluted":true}}}'),/محظور/);
assert.equal({}.polluted,undefined);

const malicious='<img src=x onerror=alert(1)>';
const db=V.validateDatabase({
  bookings:[{
    id:'booking-1',
    name:malicious,
    phone:'0500000000',
    date:'2026-07-26',
    type:'يومي',
    total:'1000',
    paid:'200',
    status:'مؤكد',
    unexpected:'drop-me',
    photos:[
      {dataUrl:'data:text/html,<script>alert(1)</script>'},
      {dataUrl:'data:image/png;base64,iVBORw0KGgo='}
    ]
  }],
  expenses:[{id:'expense-1',date:'2026-07-26',title:malicious,amount:'NaN',unexpected:true}],
  cleaningTasks:[{id:'task-1',bookingId:'booking-1',token:'x'.repeat(500),status:'جديدة'}],
  settings:{commissionRate:100,unexpected:'drop-me'},
  unexpectedRoot:true,
  seq:2
});

assert.equal(db.bookings[0].name,malicious);
assert.equal('unexpected' in db.bookings[0],false);
assert.equal(db.bookings[0].photos.length,1);
assert.equal(db.expenses[0].amount,0);
assert.equal('unexpected' in db.expenses[0],false);
assert.equal(db.cleaningTasks[0].token,'');
assert.equal('unexpectedRoot' in db,false);
assert.equal('unexpected' in db.settings,false);
assert.equal(V.phone('not-a-phone'),'');
assert.equal(V.isoDate('2026-99-99'),'');
assert.equal(V.finite(Infinity,{fallback:7}),7);

console.log('Central validation tests passed.');
