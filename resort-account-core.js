(function(root){
'use strict';

function parseMoney(value){
  const normalized=String(value??'')
    .replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-'٠'.charCodeAt(0)))
    .replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-'۰'.charCodeAt(0)))
    .replace(/[٫]/g,'.')
    .replace(/[٬،,\u00a0\s]/g,'')
    .replace(/[^\d.\-]/g,'');
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:0;
}
const num=value=>Math.max(0,parseMoney(value));
const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'');
const uuidFallback=(prefix,index)=>prefix+'-'+index;

function normalizeAccount(value){
  const source=value&&typeof value==='object'?value:{};
  const calibration=source.calibration&&typeof source.calibration==='object'&&Number.isFinite(Number(source.calibration.balance))
    ?{balance:Number(source.calibration.balance),at:text(source.calibration.at),note:text(source.calibration.note),user:text(source.calibration.user)}
    :null;
  return {
    calibration,
    financialRepairVersion:Math.max(0,Number(source.financialRepairVersion||0)||0),
    bookingReconciliationVersion:Math.max(0,Number(source.bookingReconciliationVersion||0)||0),
    bookingReconciliationAt:text(source.bookingReconciliationAt),
    bookingReconciliationIssues:arr(source.bookingReconciliationIssues).map(row=>({code:text(row?.code),reason:text(row?.reason)})).slice(0,50),
    manualMovements:arr(source.manualMovements).map(row=>({
      id:text(row?.id),direction:row?.direction==='out'?'out':'in',amount:num(row?.amount),
      date:text(row?.date),note:text(row?.note),createdAt:text(row?.createdAt),updatedAt:text(row?.updatedAt)
    })).filter(row=>row.amount>0)
  };
}
function atValue(...values){
  for(const raw of values){
    const value=text(raw).trim();
    if(!value)continue;
    const d=new Date(value.length===10?value+'T12:00:00':value);
    if(!Number.isNaN(d.getTime()))return d.toISOString();
  }
  return '';
}
function dateValue(value,fallback=''){
  const raw=text(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const d=new Date(raw||fallback);
  if(Number.isNaN(d.getTime()))return text(fallback).slice(0,10);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function movement({id='',kind='',source='',label='',amount=0,date='',at='',method='',sourceId='',editable=false}){
  const signed=Number(amount||0)||0;
  if(!signed)return null;
  return {id:text(id),kind:text(kind),source:text(source),label:text(label),amount:signed,date:dateValue(date,at),at:atValue(at,date),method:text(method),sourceId:text(sourceId),editable:!!editable};
}
function bookingCashRows(booking){
  const rows=arr(booking?.payments).filter(row=>num(row?.amount)>0);
  if(rows.length){
    return rows.map((row,index)=>movement({
      id:'booking-payment:'+text(booking.id)+':'+text(row.id||index),
      kind:'booking_payment',source:'حجز',label:`${booking.name||'عميل'} #${booking.code||''}`,
      amount:num(row.amount),date:row.date||booking.date,
      at:row.createdAt||row.date||booking.createdAt||booking.date,
      method:row.method||'غير محدد',sourceId:booking.id
    })).filter(Boolean);
  }
  const fallback=Math.max(0,num(booking?.paid)-num(booking?.customerCreditApplied));
  return fallback>0?[movement({
    id:'booking-payment-fallback:'+text(booking?.id),kind:'booking_payment',source:'حجز',
    label:`${booking?.name||'عميل'} #${booking?.code||''}`,amount:fallback,date:booking?.date,
    at:booking?.createdAt||booking?.updatedAt||booking?.date,method:'غير محدد',sourceId:booking?.id
  })]:[];
}
function subscriptionCashRows(subscription){
  const history=arr(subscription?.paymentHistory).filter(row=>num(row?.amount)>0);
  const rows=history.map((row,index)=>movement({
    id:'subscription-payment:'+text(subscription?.id)+':'+text(row?.id||index),
    kind:'subscription_payment',source:'اشتراك',label:subscription?.name||subscription?.customerName||'اشتراك',
    amount:num(row.amount),date:row.date||row.createdAt||subscription?.createdAt,
    at:row.createdAt||row.date||subscription?.createdAt,method:row.method||'غير محدد',sourceId:subscription?.id
  })).filter(Boolean);
  const recorded=history.reduce((sum,row)=>sum+num(row.amount),0);
  const fallback=Math.max(0,num(subscription?.paid)-recorded);
  if(fallback>0)rows.push(movement({
    id:'subscription-payment-fallback:'+text(subscription?.id),kind:'subscription_payment',source:'اشتراك',
    label:subscription?.name||subscription?.customerName||'اشتراك',amount:fallback,
    date:subscription?.updatedAt||subscription?.createdAt,at:subscription?.updatedAt||subscription?.createdAt,
    method:'غير محدد',sourceId:subscription?.id
  }));
  return rows.filter(Boolean);
}
function commissionMovement(row,source){
  const snap=row?.commissionSnapshot||{};
  const received=String(snap.status||'')==='received'||snap.received===true||!!snap.receivedAt||!!row?.commissionReceivedAt;
  const historical=['received_before_system','legacy_received','received_pre_system'].includes(String(snap.status||''))||row?.commissionReceivedBeforeSystem;
  const amount=num(snap.amount);
  if(!received||historical||!amount)return null;
  return movement({
    id:'commission:'+source+':'+text(row?.id),kind:'commission_transfer',source:'عمولة',
    label:source==='subscription'?`عمولة اشتراك ${row?.name||row?.customerName||''}`:`عمولة حجز #${row?.code||''}`,
    amount:-amount,date:snap.receivedAt||row?.commissionReceivedAt,
    at:snap.receivedAt||row?.commissionReceivedAt,sourceId:row?.id
  });
}
function maintenanceSummary(job){
  const total=num(job?.totalAmount);
  const paid=arr(job?.payments).reduce((sum,row)=>sum+num(row?.amount),0);
  return {total,paid,remaining:Math.max(0,total-paid),status:paid<=0?'unpaid':paid+0.009>=total?'paid':'partial'};
}
function maintenanceTotals(state,matcher){
  return arr(state?.maintenanceJobs).reduce((totals,job)=>{
    const summary=maintenanceSummary(job);
    totals.total+=summary.total;
    totals.paid+=arr(job?.payments).filter(row=>typeof matcher!=='function'||matcher(dateValue(row?.date,row?.createdAt),row,job)).reduce((sum,row)=>sum+num(row?.amount),0);
    totals.remaining+=summary.remaining;
    return totals;
  },{total:0,paid:0,remaining:0});
}
function salaryRows(state){
  return arr(state?.expenses).filter(row=>row?.expenseType==='salary'||row?.category==='راتب عامل'||row?.cat==='راتب عامل');
}
function salaryTotals(state,{month='',year=''}={}){
  const rows=salaryRows(state),matches=row=>{
    const salaryMonth=text(row?.salaryMonth||row?.date).slice(0,7);
    return (!month||salaryMonth===month)&&(!year||salaryMonth.slice(0,4)===year);
  };
  return {amount:rows.filter(matches).reduce((sum,row)=>sum+num(row?.amount),0),count:rows.filter(matches).length,rows:rows.filter(matches)};
}
function salaryKey(worker,month){return text(worker).trim().replace(/\s+/g,' ').toLocaleLowerCase('ar')+'|'+text(month).slice(0,7)}
function isSalaryDuplicate(state,{workerName='',salaryMonth='',excludeId=''}={}){
  const key=salaryKey(workerName,salaryMonth);
  return salaryRows(state).some(row=>text(row?.id)!==text(excludeId)&&salaryKey(row?.workerName||text(row?.title).replace(/^راتب العامل:\s*/,''),row?.salaryMonth||row?.date)===key);
}
function advanceTotals(state){
  return arr(state?.accountingNotes).reduce((totals,note)=>{
    const principal=num(note?.principalAmount),repaid=arr(note?.payments).reduce((sum,row)=>sum+num(row?.amount),0);
    totals.principal+=principal;totals.repaid+=repaid;totals.outstanding+=Math.max(0,principal-repaid);return totals;
  },{principal:0,repaid:0,outstanding:0});
}
function buildMovements(state){
  const db=state&&typeof state==='object'?state:{};
  const rows=[];
  for(const booking of arr(db.bookings)){
    if(booking?.recordType==='family')continue;
    rows.push(...bookingCashRows(booking));
    const cancellation=booking?.depositCancellation||{};
    if(cancellation.status==='refunded'&&num(cancellation.refundAmount)>0){
      rows.push(movement({
        id:'booking-refund:'+text(booking.id),kind:'customer_refund',source:'استرداد',
        label:`استرداد حجز #${booking.code||''} — ${booking.name||''}`,
        amount:-num(cancellation.refundAmount),date:cancellation.recordedAt||booking.updatedAt||booking.date,
        at:cancellation.recordedAt||booking.updatedAt||booking.date,sourceId:booking.id
      }));
    }
    const commission=commissionMovement(booking,'booking');if(commission)rows.push(commission);
  }
  for(const subscription of arr(db.subscriptions)){
    rows.push(...subscriptionCashRows(subscription));
    const commission=commissionMovement(subscription,'subscription');if(commission)rows.push(commission);
  }
  for(const expense of arr(db.expenses)){
    const amount=num(expense?.amount);if(!amount)continue;
    // Ordinary rows retain kind:'expense'; generated rows receive a clearer source kind.
    const expenseType=expense?.expenseType==='maintenance_payment'||expense?.maintenancePaymentId?'maintenance_payment':expense?.expenseType==='salary'||expense?.salaryMonth||expense?.category==='راتب عامل'||expense?.cat==='راتب عامل'?'salary_payment':'expense';
    const source=expenseType==='maintenance_payment'?'صيانة':expenseType==='salary_payment'?'راتب عامل':'مصروف';
    rows.push(movement({
      id:'expense:'+text(expense.id),kind:expenseType,source,
      label:`${expense.ref||''} ${expense.title||'مصروف'}`.trim(),amount:-amount,date:expense.date,
      at:expense.createdAt||expense.date||expense.updatedAt,method:expense.paymentMethod||'غير محدد',sourceId:expense.id
    }));
  }
  for(const note of arr(db.accountingNotes)){
    const principal=num(note?.principalAmount);
    if(principal>0)rows.push(movement({
      id:'advance:'+text(note.id),kind:'personal_advance',source:'سلفة/ذمة',
      label:note.title||'سلفة من حساب المنتجع',amount:-principal,date:note.date,
      at:note.createdAt||note.date,sourceId:note.id
    }));
    for(const payment of arr(note?.payments)){
      const amount=num(payment?.amount);if(!amount)continue;
      rows.push(movement({
        id:'advance-repayment:'+text(note.id)+':'+text(payment.id),kind:'advance_repayment',source:'سداد سلفة',
        label:note.title||'سداد سلفة',amount,date:payment.date,
        at:payment.createdAt||payment.date,sourceId:note.id
      }));
    }
  }
  const account=normalizeAccount(db.resortAccount);
  for(const row of account.manualMovements){
    rows.push(movement({
      id:'manual:'+text(row.id),kind:row.direction==='out'?'manual_out':'manual_in',source:'حركة يدوية',
      label:row.note|| (row.direction==='out'?'سحب يدوي':'إيداع يدوي'),
      amount:(row.direction==='out'?-1:1)*num(row.amount),date:row.date,
      at:row.createdAt||row.date,sourceId:row.id,editable:true
    }));
  }
  return rows.filter(Boolean).sort((a,b)=>String(a.at||a.date).localeCompare(String(b.at||b.date)));
}
function calibration(state){return normalizeAccount(state?.resortAccount).calibration}
function movementAfterCalibration(row,cal){
  if(!cal?.at)return true;
  const cut=new Date(cal.at).getTime(),event=new Date(row.at||row.date).getTime();
  if(!Number.isFinite(cut)||!Number.isFinite(event))return true;
  return event>cut;
}
function balanceDetails(state){
  const all=buildMovements(state),cal=calibration(state);
  const effective=cal?all.filter(row=>movementAfterCalibration(row,cal)):all;
  const baseline=cal?Number(cal.balance||0):0;
  const inflow=effective.filter(row=>row.amount>0).reduce((sum,row)=>sum+row.amount,0);
  const outflow=effective.filter(row=>row.amount<0).reduce((sum,row)=>sum+Math.abs(row.amount),0);
  return {balance:baseline+inflow-outflow,baseline,inflow,outflow,calibration:cal,movements:effective,allMovements:all};
}
function currentBalance(state){return balanceDetails(state).balance}
function periodMovements(state,matcher){return buildMovements(state).filter(row=>typeof matcher==='function'?matcher(row.date,row):true)}
function customerCashCollected(state,matcher){
  return periodMovements(state,matcher).filter(row=>['booking_payment','subscription_payment'].includes(row.kind)&&row.amount>0).reduce((sum,row)=>sum+row.amount,0);
}
function cashOutflow(state,matcher){
  return periodMovements(state,matcher).filter(row=>row.amount<0).reduce((sum,row)=>sum+Math.abs(row.amount),0);
}
function financeSummary(state,matcher){
  const expenses=arr(state?.expenses).filter(row=>typeof matcher!=='function'||matcher(dateValue(row?.date,row?.createdAt),row));
  const actualExpenses=expenses.reduce((sum,row)=>sum+num(row?.amount),0);
  const maintenancePaid=expenses.filter(row=>row?.expenseType==='maintenance_payment'||row?.maintenancePaymentId).reduce((sum,row)=>sum+num(row?.amount),0);
  const salaries=expenses.filter(row=>row?.expenseType==='salary'||row?.category==='راتب عامل'||row?.cat==='راتب عامل').reduce((sum,row)=>sum+num(row?.amount),0);
  return {actualExpenses,maintenancePaid,salaries,maintenanceDue:maintenanceTotals(state).remaining,...advanceTotals(state)};
}
function integrityIssues(state){
  const db=state&&typeof state==='object'?state:{},issues=[];
  for(const expense of arr(db.expenses))if(!(num(expense?.amount)>0))issues.push({type:'expense',id:text(expense?.id),message:'مصروف بدون مبلغ صحيح'});
  for(const booking of arr(db.bookings)){
    if(booking?.recordType==='family')continue;
    const credit=num(booking?.customerCreditApplied),payments=arr(booking?.payments).filter(row=>num(row?.amount)>0);
    if(payments.length){
      const cash=payments.reduce((sum,row)=>sum+num(row.amount),0),expected=cash+credit,paid=num(booking?.paid);
      if(Math.abs(expected-paid)>0.01)issues.push({type:'booking_payment_total',id:text(booking?.id),message:`الحجز #${booking?.code||''}: المدفوع لا يطابق الدفعات + رصيد العميل`});
    }
    const cashTotal=bookingCashRows(booking).reduce((sum,row)=>sum+Math.max(0,row.amount),0);
    const cancellation=booking?.depositCancellation||{},refund=num(cancellation.refundAmount);
    if(refund>0&&refund>cashTotal+0.01)issues.push({type:'refund',id:text(booking?.id),message:`الحجز #${booking?.code||''}: الاسترداد أكبر من النقد المسجل`});
    if(cancellation.status==='credit'&&cancellation.cancelledBy==='customer'&&cashTotal>num(cancellation.depositAmount)+0.01)issues.push({type:'customer_cancel_extra_cash',id:text(booking?.id),message:`الحجز #${booking?.code||''}: توجد دفعات نقدية أعلى من العربون في إلغاء العميل وتحتاج مراجعة يدوية`});
  }
  for(const note of arr(db.accountingNotes)){
    const principal=num(note?.principalAmount),paid=arr(note?.payments).reduce((sum,row)=>sum+num(row?.amount),0);
    if(paid>principal+0.01)issues.push({type:'advance',id:text(note?.id),message:`${note?.title||'سلفة'}: السداد أكبر من أصل المبلغ`});
  }
  const linkedExpenses=new Map();
  for(const expense of arr(db.expenses)){
    if(expense?.expenseType!=='maintenance_payment'&&!expense?.maintenancePaymentId)continue;
    const paymentId=text(expense?.maintenancePaymentId);
    if(!paymentId)issues.push({type:'maintenance_orphan_expense',id:text(expense?.id),message:'مصروف صيانة مولد دون مرجع دفعة'});
    else linkedExpenses.set(paymentId,[...(linkedExpenses.get(paymentId)||[]),expense]);
  }
  const knownPayments=new Set();
  for(const job of arr(db.maintenanceJobs)){
    const summary=maintenanceSummary(job);
    if(summary.paid>summary.total+0.01)issues.push({type:'maintenance_overpaid',id:text(job?.id),message:`${job?.title||'صيانة'}: المدفوع أكبر من إجمالي الصيانة`});
    for(const payment of arr(job?.payments)){
      const paymentId=text(payment?.id);knownPayments.add(paymentId);
      const links=linkedExpenses.get(paymentId)||[];
      if(links.length!==1)issues.push({type:'maintenance_expense_link',id:paymentId,message:`${job?.title||'صيانة'}: دفعة الصيانة مرتبطة بـ ${links.length} حركة مصروف بدل حركة واحدة`});
      else if(Math.abs(num(links[0]?.amount)-num(payment?.amount))>0.01)issues.push({type:'maintenance_amount_mismatch',id:paymentId,message:`${job?.title||'صيانة'}: مبلغ الدفعة لا يطابق المصروف المرتبط`});
    }
  }
  for(const paymentId of linkedExpenses.keys())if(!knownPayments.has(paymentId))issues.push({type:'maintenance_orphan_expense',id:paymentId,message:'مصروف صيانة مرتبط بدفعة غير موجودة'});
  return issues;
}
const api={parseMoney,num,normalizeAccount,maintenanceSummary,maintenanceTotals,salaryRows,salaryTotals,isSalaryDuplicate,advanceTotals,financeSummary,buildMovements,balanceDetails,currentBalance,periodMovements,customerCashCollected,cashOutflow,integrityIssues};
root.ResortAccountCore=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
