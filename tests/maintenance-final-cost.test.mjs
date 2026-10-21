import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const require=createRequire(import.meta.url);
const core=require('../resort-account-core.js');
function fixture(){
  const payments=[1000,500,200,500].map((amount,i)=>({id:`p${i}`,expenseId:`e${i}`,amount,date:['2026-09-15','2026-09-20','2026-09-26','2026-10-15'][i],linkedExistingExpense:i%2===0}));
  return {maintenanceJobs:[{id:'m',title:'بلاط المنتجع',vendor:'جمال الباكستاني',totalAmount:0,finalCostKnown:false,payments}],expenses:payments.map(p=>({id:p.expenseId,amount:p.amount,date:p.date,maintenanceJobId:'m',maintenancePaymentId:p.id}))};
}
const overpaid=state=>core.integrityIssues(state).filter(x=>x.type==='maintenance_overpaid');

test('unknown final cost preserves 2,200 paid and has no remaining debt or overpayment',()=>{
  const state=fixture();
  assert.deepEqual(core.maintenanceSummary(state.maintenanceJobs[0]),{total:null,paid:2200,remaining:null,status:'open'});
  assert.deepEqual(overpaid(state),[]);
  // An explicit false flag takes precedence over a provisional positive estimate.
  state.maintenanceJobs[0].totalAmount=1000;
  assert.equal(core.maintenanceFinalCostKnown(state.maintenanceJobs[0]),false);
  assert.deepEqual(core.maintenanceTotals(state),{total:0,paid:2200,remaining:0});
  assert.deepEqual(overpaid(state),[]);
});

test('known cost retains underpayment, settlement, overpayment and legacy checks',()=>{
  const state=fixture(),job=state.maintenanceJobs[0];job.finalCostKnown=true;
  for(const [total,remaining,warnings] of [[3000,800,0],[2200,0,0],[2000,0,1],[0,0,1]]){
    job.totalAmount=total;
    assert.equal(core.maintenanceSummary(job).remaining,remaining);
    assert.equal(overpaid(state).length,warnings);
  }
  delete job.finalCostKnown;job.totalAmount=2000;
  assert.equal(overpaid(state).length,1);
  job.totalAmount='٣٬٠٠٠';
  assert.equal(core.maintenanceSummary(job).remaining,800);
});

test('invalid final costs never become a zero financial ceiling',()=>{
  const state=fixture(),job=state.maintenanceJobs[0];job.finalCostKnown=true;
  for(const value of [undefined,null,'',' ',NaN,Infinity,-1,'invalid','abc2000','1.2.3']){
    job.totalAmount=value;
    assert.equal(core.maintenanceSummary(job).total,null,String(value));
    assert.deepEqual(overpaid(state),[]);
  }
});

test('linked existing expenses stay unchanged and are counted exactly once across all reads',()=>{
  const state=fixture(),before=structuredClone(state),movements=core.buildMovements(state);
  for(let i=0;i<3;i++){
    core.integrityIssues(state);core.maintenanceSummary(state.maintenanceJobs[0]);core.maintenanceTotals(state);
    assert.equal(core.financeSummary(state).actualExpenses,2200);
    assert.equal(core.currentBalance(state),-2200);
    assert.deepEqual(core.buildMovements(state),movements);
  }
  assert.equal(movements.length,4);
  assert.equal(core.cashOutflow(state),2200);
  assert.deepEqual(state,before);
});

test('mixed maintenance statistics include only known obligations and all actual payments',()=>{
  const state=fixture();
  state.maintenanceJobs.push({totalAmount:3000,finalCostKnown:true,payments:[{amount:700}]});
  assert.deepEqual(core.maintenanceTotals(state),{total:3000,paid:2900,remaining:2300});
  assert.equal(core.maintenanceTotals(state,date=>date.startsWith('2026-10')).paid,500);
  assert.equal(core.financeSummary(state).maintenanceDue,2300);
});

test('maintenance cards and totals render unknown and known costs without inventing debt',()=>{
  const source=readFileSync(new URL('../accounting-notes.js',import.meta.url),'utf8');
  const render=source.slice(source.indexOf('function renderMaintenance(){'),source.indexOf('function renderSalaries(){'));
  const state=fixture(),before=structuredClone(state),nodes={};
  const node=id=>nodes[id]??={};
  const context={Core:core,document:{getElementById:node},maintenanceJobs:()=>state.maintenanceJobs,payments:job=>job.payments.map(p=>({...p})),setMoney:(id,n)=>node(id).textContent=String(n),money:String,esc:String};
  vm.runInNewContext(render+';renderMaintenance();',context);
  assert.match(node('maintenanceList').innerHTML,/غير محددة بعد/);
  assert.match(node('maintenanceList').innerHTML,/<span>المدفوع<\/span><b>2200<\/b>/);
  assert.match(node('maintenanceList').innerHTML,/يُحسب بعد تحديد النهائي/);
  assert.doesNotMatch(node('maintenanceList').innerHTML,/متبقي 0|مسدد بالكامل/);
  assert.match(node('maintTotal').textContent,/المحددة فقط/);
  assert.match(node('maintDue').textContent,/محددة التكلفة فقط/);
  assert.deepEqual(state,before);
  state.maintenanceJobs[0].finalCostKnown=true;state.maintenanceJobs[0].totalAmount=3000;
  vm.runInNewContext(render+';renderMaintenance();',context);
  assert.match(node('maintenanceList').innerHTML,/<span>التكلفة النهائية<\/span><b>3000<\/b>/);
  assert.match(node('maintenanceList').innerHTML,/<span>المتبقي<\/span><b>800<\/b>/);
  assert.doesNotMatch(node('maintenanceList').innerHTML,/غير محددة/);
});
