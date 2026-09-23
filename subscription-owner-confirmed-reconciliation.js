(function(root){
'use strict';

const VERSION=1;
const SUBSCRIPTION_ID='ed495f64-342b-4ccb-9c99-0d463ee2606c';
const PAYMENT_ID='owner-confirmed-nora-final-450-20260923';
const TOTAL=1950;
const VERIFIED_BEFORE=1500;
const VERIFIED_FINAL=450;

function applyReconciliation(state,{at=new Date().toISOString()}={}){
  const subscriptions=Array.isArray(state?.subscriptions)?state.subscriptions:[];
  const index=subscriptions.findIndex(row=>String(row?.id||'')===SUBSCRIPTION_ID);
  if(index<0)return{changed:false,applied:[],already:[],skipped:[{id:SUBSCRIPTION_ID,reason:'subscription_missing'}]};
  const current=subscriptions[index],core=root.SubscriptionFinancialCore;
  if(!core)return{changed:false,applied:[],already:[],skipped:[{id:SUBSCRIPTION_ID,reason:'financial_core_missing'}]};
  const history=Array.isArray(current.paymentHistory)?current.paymentHistory:[];
  const existing=history.find(row=>row?.id===PAYMENT_ID),finance=core.stats(current);
  if(existing){
    const commissionStatus=String(current?.commissionSnapshot?.status||'');
    if(finance.fullyPaid&&commissionStatus==='received_before_system')return{changed:false,applied:[],already:[SUBSCRIPTION_ID],skipped:[]};
    return{changed:false,applied:[],already:[],skipped:[{id:SUBSCRIPTION_ID,reason:'reconciliation_state_changed'}]};
  }
  if(current.paymentManaged!==true||Math.abs(finance.total-TOTAL)>0.01||Math.abs(finance.paid-VERIFIED_BEFORE)>0.01){
    return{changed:false,applied:[],already:[],skipped:[{id:SUBSCRIPTION_ID,reason:'subscription_finance_changed'}]};
  }
  if(!finance.invalidPayments.some(row=>row?.amount===null||row?.amount===undefined||row?.amount==='')){
    return{changed:false,applied:[],already:[],skipped:[{id:SUBSCRIPTION_ID,reason:'unverified_payment_marker_missing'}]};
  }
  const payment={
    id:PAYMENT_ID,amount:VERIFIED_FINAL,date:'',method:'غير موثق',type:'historical_owner_confirmation',
    note:'دفعة تاريخية أكد المالك استلامها بالكامل بتاريخ 2026-09-23؛ تاريخ وطريقة الدفع الأصليان غير موثقين.',
    confirmedAt:at,historicalUnknownDate:true,balanceRecognizedBeforeCalibration:true
  };
  const updated=core.appendPayment(current,payment);
  Object.assign(updated,{
    updatedAt:at,ownerConfirmedReconciliationVersion:VERSION,ownerConfirmedReconciliationAt:at,
    commissionReceivedBeforeSystem:true,commissionReceivedAt:'',commissionReceivedBy:'',
    commissionSnapshot:{
      status:'received_before_system',received:false,receivedAt:null,receivedBeforeSystem:true,
      amount:null,amountUnverified:true,confirmedAt:at,
      reason:'أكد المالك استلام العمولة، لكن قيمة وتاريخ التحويل غير موثقين؛ مرجع تاريخي فقط ولا تُخصم مرة أخرى.'
    }
  });
  subscriptions[index]=updated;
  return{changed:true,applied:[SUBSCRIPTION_ID],already:[],skipped:[],paymentId:PAYMENT_ID};
}

async function runBrowserRepair(){
  if(typeof document==='undefined')return;
  let tries=0;
  const timer=setInterval(async()=>{
    tries+=1;
    const context=typeof root.__adwaaReconciliationContext==='function'?root.__adwaaReconciliationContext():null;
    if(!context?.db||!context?.currentUser||typeof context?.persist!=='function'){if(tries>=40)clearInterval(timer);return}
    clearInterval(timer);
    try{
      const before=JSON.stringify(context.db);
      const result=applyReconciliation(context.db,{at:new Date().toISOString()});
      root.__adwaaSubscriptionOwnerConfirmedReconciliationResult=result;
      if(!result.changed)return;
      try{localStorage.setItem(`adwaaPreSubscriptionOwnerConfirmation-${Date.now()}`,before)}catch(_){}
      if(typeof root.addAudit==='function')root.addAudit(
        'تصحيح موثق','اشتراك نورة الفضل',
        'إثبات الدفعة التاريخية الأخيرة 450 ر.س وتسجيل العمولة كمستلمة سابقًا بناءً على إفادة المالك بتاريخ 2026-09-23',
        null,{subscriptionId:SUBSCRIPTION_ID,paymentId:PAYMENT_ID,total:TOTAL,paid:TOTAL,commissionStatus:'received_before_system'}
      );
      await context.persist();
      root.dispatchEvent(new CustomEvent('adwaa-subscription-updated',{detail:result}));
    }catch(error){
      console.error('Subscription owner-confirmed reconciliation failed',error);
      root.__adwaaSubscriptionOwnerConfirmedReconciliationResult={error:String(error?.message||error)};
    }
  },250);
}

const api={VERSION,SUBSCRIPTION_ID,PAYMENT_ID,TOTAL,VERIFIED_BEFORE,VERIFIED_FINAL,applyReconciliation};
root.SubscriptionOwnerConfirmedReconciliation=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',runBrowserRepair,{once:true});
  else runBrowserRepair();
}
})(typeof window!=='undefined'?window:globalThis);
