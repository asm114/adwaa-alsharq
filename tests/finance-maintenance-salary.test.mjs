import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const require=createRequire(import.meta.url);
const core=require(fileURLToPath(new URL('../resort-account-core.js',import.meta.url)));
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

function stateWithMaintenance(amounts){
  const payments=amounts.map((amount,index)=>({id:`p${index+1}`,amount,date:`2026-09-${String(20+index).padStart(2,'0')}`}));
  return {
    bookings:[],subscriptions:[],accountingNotes:[],resortAccount:{},
    maintenanceJobs:[{id:'m1',title:'صيانة كهرباء',vendor:'الكهربائي',totalAmount:1200,payments}],
    expenses:payments.map((payment,index)=>({id:`e${index+1}`,ref:`EXP-${index+1}`,title:'دفعة صيانة: صيانة كهرباء',amount:payment.amount,date:payment.date,expenseType:'maintenance_payment',maintenanceJobId:'m1',maintenancePaymentId:payment.id}))
  };
}

test('صيانة 1200 ودفعة 700 تخصم المدفوع فقط وتترك 500',()=>{
  const state=stateWithMaintenance([700]);
  assert.deepEqual(core.maintenanceSummary(state.maintenanceJobs[0]),{total:1200,paid:700,remaining:500,status:'partial'});
  assert.equal(core.currentBalance(state),-700);
  assert.equal(core.buildMovements(state).filter(row=>row.kind==='maintenance_payment').length,1);
});

test('إضافة 300 ثم 200 تكمل الصيانة دون خصم الالتزام مرتين',()=>{
  const partial=stateWithMaintenance([700,300]);
  assert.equal(core.maintenanceSummary(partial.maintenanceJobs[0]).remaining,200);
  assert.equal(core.currentBalance(partial),-1000);
  const settled=stateWithMaintenance([700,300,200]);
  assert.equal(core.maintenanceSummary(settled.maintenanceJobs[0]).status,'paid');
  assert.equal(core.maintenanceSummary(settled.maintenanceJobs[0]).remaining,0);
  assert.equal(core.currentBalance(settled),-1200);
});

test('تعديل دفعة الصيانة يعيد حساب الرصيد والمدفوع والمتبقي',()=>{
  const state=stateWithMaintenance([700]);
  state.maintenanceJobs[0].payments[0].amount=600;
  state.expenses[0].amount=600;
  assert.equal(core.maintenanceSummary(state.maintenanceJobs[0]).paid,600);
  assert.equal(core.maintenanceSummary(state.maintenanceJobs[0]).remaining,600);
  assert.equal(core.currentBalance(state),-600);
});

test('حذف دفعة الصيانة يعيدها إلى الرصيد ويزيد المتبقي',()=>{
  const state=stateWithMaintenance([700,300]);
  state.maintenanceJobs[0].payments.pop();
  state.expenses.pop();
  assert.equal(core.currentBalance(state),-700);
  assert.equal(core.maintenanceSummary(state.maintenanceJobs[0]).remaining,500);
});

test('راتب العامل يخصم مرة واحدة وتوجد حماية العامل والشهر',()=>{
  const state={bookings:[],subscriptions:[],accountingNotes:[],maintenanceJobs:[],resortAccount:{},expenses:[{id:'s1',title:'راتب العامل: جميل',workerName:'جميل',salaryMonth:'2026-09',amount:2500,date:'2026-09-23',expenseType:'salary'}]};
  assert.equal(core.currentBalance(state),-2500);
  assert.equal(core.salaryTotals(state,{month:'2026-09'}).amount,2500);
  assert.equal(core.salaryTotals(state,{year:'2026'}).amount,2500);
  assert.equal(core.isSalaryDuplicate(state,{workerName:' جميل ',salaryMonth:'2026-09'}),true);
  assert.equal(core.isSalaryDuplicate(state,{workerName:'جميل',salaryMonth:'2026-09',excludeId:'s1'}),false);
});

test('السلفة تخفض الرصيد وسدادها يعيد المبلغ',()=>{
  const state={bookings:[],subscriptions:[],expenses:[],maintenanceJobs:[],resortAccount:{},accountingNotes:[{id:'a1',principalAmount:1000,date:'2026-09-01',payments:[{id:'r1',amount:400,date:'2026-09-10'}]}]};
  assert.equal(core.currentBalance(state),-600);
  assert.deepEqual(core.advanceTotals(state),{principal:1000,repaid:400,outstanding:600});
});

test('الرصيد النهائي يساوي الرصيد السابق زائد الداخل ناقص الخارج الفعلي',()=>{
  const state=stateWithMaintenance([700]);
  state.resortAccount={calibration:{balance:4000,at:'2026-09-19T00:00:00Z'}};
  state.bookings=[{id:'b1',code:'AD-1',name:'عميل',payments:[{id:'bp1',amount:1000,date:'2026-09-21',createdAt:'2026-09-21T10:00:00Z'}]}];
  assert.equal(core.currentBalance(state),4300);
  assert.equal(core.balanceDetails(state).inflow,1000);
  assert.equal(core.balanceDetails(state).outflow,700);
});

test('الأرقام العربية والفارسية تعمل في الصيانة والراتب والدفعات',()=>{
  assert.equal(core.parseMoney('١٬٢٠٠'),1200);
  assert.equal(core.parseMoney('٧٠٠'),700);
  assert.equal(core.parseMoney('۳۰۰'),300);
});

test('سلامة الربط تكشف الحركة المكررة أو المفقودة',()=>{
  const state=stateWithMaintenance([700]);
  assert.equal(core.integrityIssues(state).length,0);
  state.expenses.push({...state.expenses[0],id:'duplicate-expense'});
  assert.ok(core.integrityIssues(state).some(issue=>issue.type==='maintenance_expense_link'));
});

test('واجهة المالية تميز المصادر وتحمي حذف سجل صيانة له دفعات',async()=>{
  const js=await read('accounting-notes.js');
  const ledger=await read('resort-account-balance.js');
  assert.match(js,/إنشاء الصيانة لا يخصم من الرصيد/);
  assert.match(js,/لا يمكن حذف صيانة لها دفعات فعلية/);
  assert.match(js,/تكرار مقصود/);
  assert.match(js,/AdwaaNumberInput\?\.scan/);
  assert.match(ledger,/maintenance_payment:'دفعة صيانة'/);
  assert.match(ledger,/salary_payment:'راتب عامل'/);
});
