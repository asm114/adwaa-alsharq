(function(root){
  'use strict';

  const safeNumber=value=>Math.max(0,Number(value||0));
  const isCancelled=booking=>/ملغي|cancel/i.test(String(booking?.status||''));
  const isFamily=booking=>String(booking?.recordType||'').toLowerCase()==='family';
  const paymentRows=booking=>(Array.isArray(booking?.payments)?booking.payments:[]).filter(row=>safeNumber(row?.amount)>0);
  const paymentSum=booking=>paymentRows(booking).reduce((sum,row)=>sum+safeNumber(row.amount),0);
  const appliedCredit=booking=>safeNumber(booking?.customerCreditApplied);

  function cashReceived(booking){
    const rows=paymentRows(booking);
    if(rows.length)return paymentSum(booking);
    return Math.max(0,safeNumber(booking?.paid)-appliedCredit(booking));
  }

  function settledAmount(booking){
    const rows=paymentRows(booking);
    if(rows.length)return paymentSum(booking)+appliedCredit(booking);
    return safeNumber(booking?.paid);
  }

  function remainingAmount(booking){
    if(!booking||isFamily(booking)||isCancelled(booking))return 0;
    return Math.max(0,safeNumber(booking.total)-settledAmount(booking));
  }

  function paymentStatus(booking){
    if(isFamily(booking))return{code:'not_applicable',remaining:0};
    if(isCancelled(booking))return{code:'cancelled',remaining:0};
    const total=safeNumber(booking?.total),paid=settledAmount(booking),remaining=remainingAmount(booking);
    if(!(total>0))return{code:'unset',remaining:0};
    if(remaining<=0)return{code:'paid',remaining:0};
    return{code:paid>0?'partial':'due',remaining};
  }

  function normalizePaymentRows(rows){
    return (Array.isArray(rows)?rows:[])
      .map((row,index)=>({...row,amount:safeNumber(row?.amount),order:index}))
      .filter(row=>row.amount>0);
  }

  function applyPaymentLedger(booking,rows){
    const payments=normalizePaymentRows(rows),credit=appliedCredit(booking);
    return{...(booking||{}),payments,paid:payments.reduce((sum,row)=>sum+row.amount,0)+credit};
  }

  let formSaveDepth=0;
  function withFormSaveScope(callback){
    formSaveDepth++;
    try{return callback()}finally{formSaveDepth=Math.max(0,formSaveDepth-1)}
  }
  const isFormSaveActive=()=>formSaveDepth>0;

  const api={safeNumber,isCancelled,isFamily,paymentRows,paymentSum,appliedCredit,cashReceived,settledAmount,remainingAmount,paymentStatus,normalizePaymentRows,applyPaymentLedger,withFormSaveScope,isFormSaveActive};
  root.BookingFinancialCore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
