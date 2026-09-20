(function(root){
  'use strict';
  const safeNumber=v=>Math.max(0,Number(v||0));
  const normalizePhone=v=>String(v||'').replace(/\D/g,'');
  const normalizeName=v=>String(v||'').trim().toLowerCase();
  const customerKey=(name,phone)=>normalizePhone(phone)||normalizeName(name);
  const creditRows=ledger=>Array.isArray(ledger)?ledger:[];
  function recalculateBalances(ledger){
    const balances=new Map();
    return creditRows(ledger).map(row=>{
      const copy={...row};
      const key=String(copy.customerKey||'');
      const before=balances.get(key)||0;
      const amount=safeNumber(copy.amount);
      const after=Math.max(0,before+(copy.type==='credit'?amount:copy.type==='debit'?-amount:0));
      balances.set(key,after);
      copy.balanceAfter=after;
      copy.sourceBookingId=String(copy.sourceBookingId||'');
      copy.sourceBookingCode=String(copy.sourceBookingCode||'');
      copy.targetBookingId=String(copy.targetBookingId||'');
      copy.targetBookingCode=String(copy.targetBookingCode||'');
      copy.createdAt=String(copy.createdAt||'');
      return copy;
    });
  }
  function balanceFor(ledger,key,{excludeTargetBookingId=''}={}){
    return recalculateBalances(ledger).reduce((sum,row)=>{
      if(String(row.customerKey||'')!==String(key||''))return sum;
      if(excludeTargetBookingId&&row.type==='debit'&&String(row.targetBookingId||'')===String(excludeTargetBookingId))return sum;
      const amount=safeNumber(row.amount);
      return sum+(row.type==='credit'?amount:row.type==='debit'?-amount:0);
    },0);
  }
  function depositAmount(booking){
    const payments=Array.isArray(booking?.payments)?booking.payments:[];
    const deposit=payments.find(row=>row?.type==='deposit');
    if(deposit)return safeNumber(deposit.amount);
    return Math.max(0,safeNumber(booking?.paid)-safeNumber(booking?.customerCreditApplied));
  }
  function cashCollected(booking){
    const payments=Array.isArray(booking?.payments)?booking.payments:[];
    if(payments.length)return payments.reduce((sum,row)=>sum+safeNumber(row?.amount),0);
    return Math.max(0,safeNumber(booking?.paid)-safeNumber(booking?.customerCreditApplied));
  }
  function addCreditOnce(ledger,{customerKey:key,name='',phone='',amount=0,sourceBookingId='',sourceBookingCode='',createdAt=''}) {
    let rows=creditRows(ledger).map(row=>({...row}));
    const normalizedAmount=safeNumber(amount);
    if(!key||!normalizedAmount)return recalculateBalances(rows);
    const exists=rows.some(row=>row?.type==='credit'&&String(row?.sourceBookingId||'')===String(sourceBookingId||'')&&String(row?.customerKey||'')===String(key));
    if(exists)return recalculateBalances(rows);
    rows.push({
      id:'credit-'+String(sourceBookingId||Date.now()),
      type:'credit',customerKey:String(key),name:String(name||''),phone:String(phone||''),amount:normalizedAmount,
      sourceBookingId:String(sourceBookingId||''),sourceBookingCode:String(sourceBookingCode||''),
      targetBookingId:'',targetBookingCode:'',
      note:'تحويل عربون حجز ملغي إلى رصيد عميل',createdAt:createdAt||new Date().toISOString(),balanceAfter:0
    });
    return recalculateBalances(rows);
  }
  function setDebitForBooking(ledger,{customerKey:key,name='',phone='',amount=0,targetBookingId='',targetBookingCode='',createdAt=''}) {
    let rows=creditRows(ledger).filter(row=>!(row?.type==='debit'&&String(row?.targetBookingId||'')===String(targetBookingId||''))).map(row=>({...row}));
    const normalizedAmount=safeNumber(amount);
    if(!key||!normalizedAmount)return recalculateBalances(rows);
    const available=balanceFor(rows,key);
    if(normalizedAmount>available+0.009)throw new Error('رصيد العميل غير كافٍ لهذه التسوية.');
    rows.push({
      id:'debit-'+String(targetBookingId||Date.now()),
      type:'debit',customerKey:String(key),name:String(name||''),phone:String(phone||''),amount:normalizedAmount,
      sourceBookingId:'',sourceBookingCode:'',
      targetBookingId:String(targetBookingId||''),targetBookingCode:String(targetBookingCode||''),
      note:'استخدام رصيد العميل في حجز',createdAt:createdAt||new Date().toISOString(),balanceAfter:0
    });
    return recalculateBalances(rows);
  }
  const api={safeNumber,normalizePhone,customerKey,recalculateBalances,balanceFor,depositAmount,cashCollected,addCreditOnce,setDebitForBooking};
  root.CustomerCreditCore=api;
})(typeof window!=='undefined'?window:globalThis);
