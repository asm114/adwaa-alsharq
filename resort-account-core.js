(function(root){
'use strict';

const num=value=>Math.max(0,Number(value||0)||0);
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
    rows.push(movement({
      id:'expense:'+text(expense.id),kind:'expense',source:'مصروف',
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
  return issues;
}
const api={num,normalizeAccount,buildMovements,balanceDetails,currentBalance,periodMovements,customerCashCollected,cashOutflow,integrityIssues};
root.ResortAccountCore=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);