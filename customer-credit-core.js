(function(root){
  'use strict';
  const safeNumber=v=>Math.max(0,Number(v||0));
  const normalizePhone=v=>String(v||'').replace(/\D/g,'');
  const normalizeName=v=>String(v||'').trim().toLowerCase();
  const customerKey=(name,phone)=>normalizePhone(phone)||normalizeName(name);
  const creditRows=ledger=>Array.isArray(ledger)?ledger:[];
  function balanceFor(ledger,key,{excludeTargetBookingId=''}={}){
    return creditRows(ledger).reduce((sum,row)=>{
      if(String(row?.customerKey||'')!==String(key||''))return sum;
      if(excludeTargetBookingId&&row?.type==='debit'&&String(row?.targetBookingId||'')===String(excludeTargetBookingId))return sum;
      const amount=safeNumber(row?.amount);
      return sum+(row?.type==='credit'?amount:row?.type==='debit'?-amount:0);
    },0);
  }
  function depositAmount(booking){
    const payments=Array.isArray(booking?.payments)?booking.payments:[];
    const deposit=payments.find(row=>row?.type==='deposit');
    if(deposit)return safeNumber(deposit.amount);
    return Math.max(0,safeNumber(booking?.paid)-safeNumber(booking?.customerCreditApplied));
  }
  function cashCollected(booking){
    return Math.max(0,safeNumber(booking?.paid)-safeNumber(booking?.customerCreditApplied));
  }
  function addCreditOnce(ledger,{customerKey:key,name='',phone='',amount=0,sourceBookingId='',sourceBookingCode='',createdAt=''}){
    const rows=creditRows(ledger).map(row=>({...row}));
    const normalizedAmount=safeNumber(amount);
    if(!key||!normalizedAmount)return rows;
    const exists=rows.some(row=>row?.type==='credit'&&String(row?.sourceBookingId||'')===String(sourceBookingId||'')&&String(row?.customerKey||'')===String(key));
    if(exists)return rows;
    rows.push({
      id:'credit-'+String(sourceBookingId||Date.now()),
      type:'credit',customerKey:String(key),name:String(name||''),phone:String(phone||''),amount:normalizedAmount,
      sourceBookingId:String(sourceBookingId||''),sourceBookingCode:String(sourceBookingCode||''),
      note:'تحويل عربون حجز ملغي إلى رصيد عميل',createdAt:createdAt||new Date().toISOString()
    });
    return rows;
  }
  function setDebitForBooking(ledger,{customerKey:key,name='',phone='',amount=0,targetBookingId='',targetBookingCode='',createdAt=''}){
    const rows=creditRows(ledger).filter(row=>!(row?.type==='debit'&&String(row?.targetBookingId||'')===String(targetBookingId||''))).map(row=>({...row}));
    const normalizedAmount=safeNumber(amount);
    if(!key||!normalizedAmount)return rows;
    rows.push({
      id:'debit-'+String(targetBookingId||Date.now()),
      type:'debit',customerKey:String(key),name:String(name||''),phone:String(phone||''),amount:normalizedAmount,
      targetBookingId:String(targetBookingId||''),targetBookingCode:String(targetBookingCode||''),
      note:'استخدام رصيد العميل في حجز',createdAt:createdAt||new Date().toISOString()
    });
    return rows;
  }
  const api={safeNumber,normalizePhone,customerKey,balanceFor,depositAmount,cashCollected,addCreditOnce,setDebitForBooking};
  root.CustomerCreditCore=api;
})(typeof window!=='undefined'?window:globalThis);
