(function(root){
'use strict';

const EPSILON=0.01;
const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'');
function amount(value){
  if(value===null||value===undefined||value==='')return 0;
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>0?parsed:0;
}
function totalAmount(value){
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>0?parsed:0;
}
function isValidPayment(row){return !!row&&amount(row.amount)>0}
function validPayments(subscription){return arr(subscription?.paymentHistory).filter(isValidPayment)}
function invalidPayments(subscription){
  return arr(subscription?.paymentHistory).filter(row=>!isValidPayment(row));
}
function hasLedger(subscription){return arr(subscription?.paymentHistory).length>0}
function stats(subscription){
  const total=totalAmount(subscription?.total);
  const ledger=hasLedger(subscription);
  const payments=validPayments(subscription);
  const paid=ledger
    ?payments.reduce((sum,row)=>sum+amount(row.amount),0)
    :amount(subscription?.paid);
  const delta=total-paid;
  return {
    total,paid,collected:paid,
    due:delta>EPSILON?delta:0,
    overpaid:paid-total>EPSILON?paid-total:0,
    fullyPaid:total>0&&Math.abs(delta)<=EPSILON,
    source:ledger?'payment_history':'legacy_paid',
    validPayments:payments,
    invalidPayments:invalidPayments(subscription)
  };
}
function statusFields(finance){
  if(finance.overpaid>0)return{status:'review',paymentStatus:'يحتاج مراجعة مالية'};
  if(finance.fullyPaid)return{status:'paid',paymentStatus:'مدفوع بالكامل'};
  if(finance.paid>0)return{status:'partial',paymentStatus:'مدفوع جزئيًا'};
  return{status:'partial',paymentStatus:'غير مدفوع'};
}
function reconcile(subscription){
  const next={...(subscription||{})},finance=stats(next),status=statusFields(finance);
  next.paid=finance.paid;
  next.remaining=finance.due;
  next.status=status.status;
  next.paymentStatus=status.paymentStatus;
  return next;
}
function appendPayment(subscription,payment){
  const finance=stats(subscription),value=amount(payment?.amount);
  if(!(value>0))throw new Error('INVALID_SUBSCRIPTION_PAYMENT');
  if(finance.total<=0)throw new Error('INVALID_SUBSCRIPTION_TOTAL');
  if(finance.fullyPaid)throw new Error('SUBSCRIPTION_ALREADY_PAID');
  if(finance.overpaid>0||value-finance.due>EPSILON)throw new Error('SUBSCRIPTION_PAYMENT_EXCEEDS_DUE');
  const next={...(subscription||{}),paymentHistory:[...arr(subscription?.paymentHistory),{...payment,amount:value}]};
  return reconcile(next);
}
function paymentMovements(subscription){
  const finance=stats(subscription);
  if(finance.source==='payment_history'){
    return finance.validPayments.map((row,index)=>({
      ...row,amount:amount(row.amount),
      id:row.id||`payment-${index}`,
      date:row.historicalUnknownDate?'':(row.date||row.createdAt||subscription?.createdAt||subscription?.updatedAt||'')
    }));
  }
  return finance.paid>0?[{
    id:`legacy-paid-${text(subscription?.id)||'subscription'}`,
    amount:finance.paid,date:subscription?.createdAt||subscription?.updatedAt||'',
    method:'غير محدد',legacy:true
  }]:[];
}
function isManagedVisit(booking,subscriptionIds){
  return !!(booking&&(booking.subscriptionVisit===true||booking.subscriptionPaymentManaged===true||(booking.subscriptionId&&subscriptionIds?.has(booking.subscriptionId))));
}
function integrityIssues(state){
  const subscriptions=arr(state?.subscriptions),bookings=arr(state?.bookings),issues=[];
  const ids=new Set(subscriptions.map(row=>row?.id).filter(Boolean));
  const commissionEnabled=state?.settings?.commissionEnabled!==false;
  for(const subscription of subscriptions){
    if(subscription?.paymentManaged!==true)continue;
    const finance=stats(subscription),id=text(subscription?.id);
    if(finance.invalidPayments.length)issues.push({type:'subscription_invalid_payment',id,count:finance.invalidPayments.length,message:'يوجد سجل دفعة بلا مبلغ مالي صحيح'});
    if(finance.overpaid>0)issues.push({type:'subscription_overpaid',id,amount:finance.overpaid,message:'مجموع الدفعات أكبر من قيمة الاشتراك'});
    if(finance.source==='payment_history'&&Math.abs(amount(subscription?.paid)-finance.paid)>EPSILON)issues.push({type:'subscription_paid_mismatch',id,stored:amount(subscription?.paid),actual:finance.paid,message:'حقل المدفوع لا يطابق سجل الدفعات'});
    if(Number.isFinite(Number(subscription?.remaining))&&Math.abs(Math.max(0,Number(subscription.remaining))-finance.due)>EPSILON)issues.push({type:'subscription_remaining_mismatch',id,stored:Number(subscription.remaining),actual:finance.due,message:'المتبقي المخزن لا يطابق القيمة المحسوبة'});
    if(/^(paid|مدفوع بالكامل)$/i.test(text(subscription?.status))||text(subscription?.paymentStatus)==='مدفوع بالكامل'){
      if(!finance.fullyPaid)issues.push({type:'subscription_false_paid_status',id,message:'الاشتراك مصنف مدفوعًا بالكامل دون دفعات كافية'});
    }
    const paymentIds=new Set();
    for(const row of finance.validPayments){
      const paymentId=text(row?.id);if(!paymentId)continue;
      if(paymentIds.has(paymentId))issues.push({type:'subscription_duplicate_payment_id',id,paymentId,message:'معرف دفعة مكرر داخل الاشتراك'});
      paymentIds.add(paymentId);
    }
    const commission=subscription?.commissionSnapshot;
    if(commission&&(commission.status==='earned'||commission.status==='received')&&!finance.fullyPaid)issues.push({type:'subscription_commission_before_full_payment',id,message:'العمولة مسجلة قبل اكتمال السداد الحقيقي'});
    if(finance.fullyPaid&&commissionEnabled&&(!commission||!commission.status||commission.status==='not_earned'))issues.push({type:'subscription_commission_not_visible',id,message:'الاشتراك مكتمل السداد وعمولته غير ظاهرة للمتابعة'});
  }
  for(const booking of bookings){
    if(!booking?.subscriptionId&&!booking?.subscriptionVisit&&!booking?.subscriptionPaymentManaged)continue;
    const id=text(booking?.id);
    if(booking?.subscriptionId&&!ids.has(booking.subscriptionId))issues.push({type:'orphan_subscription_visit',id,subscriptionId:text(booking.subscriptionId),message:'زيارة اشتراك مرتبطة باشتراك غير موجود'});
    if(isManagedVisit(booking,ids)&&(amount(booking?.total)>0||amount(booking?.paid)>0||arr(booking?.payments).some(isValidPayment)))issues.push({type:'subscription_visit_finance',id,message:'زيارة الاشتراك تحتوي قيمة مالية مستقلة'});
    if(isManagedVisit(booking,ids)&&amount(booking?.commissionSnapshot?.amount)>0)issues.push({type:'subscription_visit_commission',id,message:'زيارة الاشتراك تحتوي عمولة مستقلة تكرر عمولة الاشتراك الرئيسي'});
  }
  return issues;
}

const api={EPSILON,amount,totalAmount,isValidPayment,validPayments,invalidPayments,hasLedger,stats,reconcile,appendPayment,paymentMovements,isManagedVisit,integrityIssues};
root.SubscriptionFinancialCore=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
