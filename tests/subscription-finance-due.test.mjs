import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../subscription-revenue-integration.js',import.meta.url),'utf8');

function runFinance(db,period='all'){
  const ids=['finRevenue','finDue','finCommissionOutstanding','finCommissionReceived','commissionTotal','finProfit','sRevenueToday','sRevenueMonth','sPaid','sDue','sPending','sCommission'];
  const elements=Object.fromEntries(ids.map(id=>[id,{id,textContent:'',className:''}]));
  elements.financePeriod={id:'financePeriod',value:period};
  const document={readyState:'complete',getElementById:id=>elements[id]||null,addEventListener(){}};
  const window={db,money:value=>`M${Number(value)}`,addEventListener(){}};
  const context={window,document,console,Date,setTimeout:fn=>{fn();return 1},clearTimeout(){}};
  vm.runInNewContext(source,context,{filename:'subscription-revenue-integration.js'});
  return elements;
}

test('finance due includes ordinary bookings and centrally managed subscription balance',()=>{
  const elements=runFinance({
    bookings:[
      {id:'b1',date:'2026-08-01',status:'مؤكد',total:1000,paid:500},
      {id:'b2',date:'2026-08-02',status:'مؤكد',total:1000,paid:500},
      {id:'visit-1',date:'2026-08-03',status:'مؤكد',subscriptionId:'sub-1',subscriptionPaymentManaged:true,total:0,paid:0}
    ],
    subscriptions:[
      {id:'sub-1',paymentManaged:true,status:'partial',total:1950,paid:1200,createdAt:'2026-08-01T10:00:00Z',paymentHistory:[]}
    ],
    expenses:[]
  });

  assert.equal(elements.finDue.textContent,'M1750');
  assert.equal(elements.sDue.textContent,'M1750');
  assert.equal(elements.sPending.textContent,'M1750');
});

test('outstanding balances are summed per record so overpayment does not hide another due balance',()=>{
  const elements=runFinance({
    bookings:[
      {id:'overpaid',date:'2026-08-01',status:'مؤكد',total:1000,paid:1200},
      {id:'due',date:'2026-08-02',status:'مؤكد',total:1000,paid:500}
    ],
    subscriptions:[],
    expenses:[]
  });

  assert.equal(elements.finDue.textContent,'M500');
  assert.equal(elements.sDue.textContent,'M500');
});
