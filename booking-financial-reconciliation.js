(function(root){
'use strict';

const VERSION=1;
const PLAN_DATE='2026-09-22';

const num=v=>Math.max(0,Number(v||0)||0);
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const sumPayments=booking=>(Array.isArray(booking?.payments)?booking.payments:[]).reduce((sum,row)=>sum+num(row?.amount),0);
const paidTotal=booking=>sumPayments(booking)+num(booking?.customerCreditApplied);

const plans=[
  {code:'AD-0010',id:'f80356ff-2bc2-4e62-97f8-c40c9761dfb8',total:5200,expect:{paid:0,payments:0,status:'تم الدخول'},payment:{id:'legacy-repair-ad0010-20260722-5200',date:'2026-07-22',note:'دفعة تاريخية مثبتة بسجل التدقيق؛ طريقة الدفع الأصلية غير متاحة',type:'legacy',order:0,amount:5200,method:'unknown',createdAt:'2026-07-22T10:57:54.313Z'}},
  {code:'AD-0019',id:'26d8ee99-dfbc-45c6-be86-8afc04f2c699',total:600,expect:{paid:0,payments:0,status:'مؤكد'},payment:{id:'legacy-repair-ad0019-20260722-600',date:'2026-07-22',note:'دفعة تاريخية مثبتة بسجل التدقيق؛ طريقة الدفع الأصلية غير متاحة',type:'legacy',order:0,amount:600,method:'unknown',createdAt:'2026-07-22T11:26:46.714Z'}},
  {code:'AD-0027',id:'4836283f-9770-44ad-b3e9-8ebaf6e7ea9c',total:600,expect:{paid:0,payments:0,status:'مؤكد'},payment:{id:'legacy-repair-ad0027-20260722-600',date:'2026-07-22',note:'دفعة تاريخية مثبتة بسجل التدقيق؛ طريقة الدفع الأصلية غير متاحة',type:'legacy',order:0,amount:600,method:'unknown',createdAt:'2026-07-22T11:38:04.497Z'}},
  {code:'AD-0028',id:'b9b422d3-9e77-4ab4-bdb8-e0734bf6f071',total:600,expect:{paid:0,payments:0,status:'مؤكد'},payment:{id:'legacy-repair-ad0028-20260722-600',date:'2026-07-22',note:'دفعة تاريخية مثبتة بسجل التدقيق؛ طريقة الدفع الأصلية غير متاحة',type:'legacy',order:0,amount:600,method:'unknown',createdAt:'2026-07-22T11:39:28.351Z'}},
  {code:'AD-0032',id:'f8398271-ff54-40b9-b904-5b60c4755ff7',total:1500,expect:{paid:1134,status:'تم الخروج',paymentIds:['d30583b0-490a-4e27-98af-0b62b9995000','5cc3b409-f8ac-4f2d-873e-a733aff7a2a0']},payment:{id:'legacy-repair-ad0032-cash-366',date:'2026-08-06',note:'دفعة نقدية تاريخية مثبتة بالتدقيق وإفادة المالك',type:'legacy',order:2,amount:366,method:'cash',createdAt:'2026-08-06T08:18:12.640Z'}},
  {code:'AD-0072',id:'8f4d89c6-462f-4ab3-9b62-9140d2256adf',total:650,expect:{paid:550,status:'تم الخروج',paymentIds:['f17ffe5f-3345-493e-90c0-dabe94c7596c']},payment:{id:'f4e5ef36-e94a-46af-ad3c-3fb54abf0746',date:'2026-08-20',note:'عربون الحجز',type:'deposit',order:0,amount:100,method:'transfer',createdAt:'2026-08-20T19:55:29.928Z'}},
  {code:'AD-0074',id:'e70e4403-a45e-4353-92ca-ecb54ed2972a',total:5600,expect:{paid:0,payments:0,status:'مؤكد'},payment:{id:'f4866b9e-3289-41a9-8ddb-cd06859ba267',date:'2026-08-27',note:'عربون الحجز',type:'deposit',order:0,amount:3000,method:'transfer',createdAt:'2026-08-27T02:32:43.611Z'}},
  {code:'AD-0075',id:'8df2d8c3-1092-4fbf-933c-96a29c57bce5',total:700,expect:{paid:0,payments:0,status:'تم الدخول'},payment:{id:'aa268494-23e1-4690-922a-54093553af49',date:'2026-08-27',note:'عربون الحجز',type:'deposit',order:0,amount:700,method:'transfer',createdAt:'2026-08-27T14:53:02.177Z'},setStatus:'تم الخروج'},
  {code:'AD-0076',id:'83d39268-4385-43a2-9836-765b82b61b24',total:1500,expect:{paid:0,payments:0,status:'ملغي'},payment:{id:'9b666ab4-76ec-4e29-8949-4dc4f7e3dfdf',date:'2026-09-08',note:'عربون الحجز',type:'deposit',order:0,amount:500,method:'transfer',createdAt:'2026-09-08T07:30:24.643Z'},createCredit:500,cancelledAt:'2026-09-08T20:27:11.063Z'},
  {code:'AD-0077',id:'9353829a-9153-4a1b-b246-29ed3e1167fe',total:650,expect:{paid:0,payments:0,status:'مؤكد'},payment:{id:'ec6b8e68-550a-450a-9dc0-76a4df7b96a1',date:'2026-09-11',note:'عربون الحجز',type:'deposit',order:0,amount:150,method:'transfer',createdAt:'2026-09-11T18:12:23.989Z'}}
];

const postponedPlan={code:'AD-0026',id:'7d89558f-0a4b-45a9-974e-967fb52a0a3a',total:600,expectedDate:'2026-09-25',paymentId:'becbe1eb-299e-453c-a1c5-4d33fc91bc4c'};

function paymentIds(booking){return new Set((booking?.payments||[]).map(row=>String(row?.id||'')))}
function matchesPlan(booking,plan){
  if(!booking||String(booking.id)!==plan.id||String(booking.code)!==plan.code)return {ok:false,reason:'id_or_code'};
  if(Math.abs(num(booking.total)-plan.total)>0.01)return {ok:false,reason:'total_changed'};
  if(plan.expect?.status&&String(booking.status)!==plan.expect.status)return {ok:false,reason:'status_changed'};
  const ids=paymentIds(booking);
  if(ids.has(plan.payment.id))return {ok:true,already:true};
  if(plan.expect?.payments!=null&&Number(booking?.payments?.length||0)!==plan.expect.payments)return {ok:false,reason:'payments_changed'};
  if(plan.expect?.paymentIds){
    for(const id of plan.expect.paymentIds)if(!ids.has(id))return {ok:false,reason:'expected_payment_missing'};
    if((booking.payments||[]).some(row=>!plan.expect.paymentIds.includes(String(row.id||''))))return {ok:false,reason:'unexpected_payment_present'};
  }
  if(Math.abs(num(booking.paid)-num(plan.expect?.paid))>0.01)return {ok:false,reason:'paid_changed'};
  return {ok:true,already:false};
}
function ensureCredit(state,booking,amount,at){
  const core=root.CustomerCreditCore;
  if(!core)return {changed:false,error:'customer_credit_core_missing'};
  const key=core.customerKey(booking.name,booking.phone);
  const before=Array.isArray(state.customerCredits)?state.customerCredits:[];
  const next=core.addCreditOnce(before,{
    customerKey:key,name:booking.name,phone:booking.phone,amount,
    sourceBookingId:booking.id,sourceBookingCode:booking.code,createdAt:at
  });
  const changed=JSON.stringify(next)!==JSON.stringify(before);
  state.customerCredits=next;
  return {changed};
}
function applyReconciliation(state,{at=new Date().toISOString()}={}){
  const db=state&&typeof state==='object'?state:null;
  if(!db||!Array.isArray(db.bookings))return {changed:false,applied:[],already:[],skipped:[{code:'*',reason:'invalid_state'}],changes:[]};
  const applied=[],already=[],skipped=[],changes=[];
  const byCode=new Map(db.bookings.map(row=>[String(row?.code||''),row]));

  for(const plan of plans){
    const booking=byCode.get(plan.code);
    const check=matchesPlan(booking,plan);
    if(!check.ok){skipped.push({code:plan.code,reason:check.reason});continue}
    if(check.already){
      const expected=paidTotal(booking);
      if(Math.abs(num(booking.paid)-expected)<=0.01){already.push(plan.code);continue}
      skipped.push({code:plan.code,reason:'restored_payment_but_paid_mismatch'});continue;
    }
    const before=clone(booking);
    booking.payments=Array.isArray(booking.payments)?booking.payments.map(row=>({...row})):[];
    booking.payments.push({...plan.payment});
    booking.payments.sort((a,b)=>Number(a.order??999)-Number(b.order??999)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    booking.payments.forEach((row,index)=>row.order=index);
    booking.paid=paidTotal(booking);
    if(plan.setStatus)booking.status=plan.setStatus;
    if(plan.createCredit){
      booking.depositCancellation={
        ...(booking.depositCancellation||{}),
        status:'credit',cancelledBy:'customer',
        depositAmount:plan.createCredit,settlementAmount:plan.createCredit,refundAmount:0,
        recordedAt:booking.depositCancellation?.recordedAt||plan.cancelledAt
      };
      const credit=ensureCredit(db,booking,plan.createCredit,plan.cancelledAt);
      if(credit.error){Object.assign(booking,before);skipped.push({code:plan.code,reason:credit.error});continue}
    }
    booking.updatedAt=at;
    applied.push(plan.code);
    changes.push({code:plan.code,before,after:clone(booking),kind:'payment_restore'});
  }

  const postponed=byCode.get(postponedPlan.code);
  if(postponed&&String(postponed.id)===postponedPlan.id&&Math.abs(num(postponed.total)-postponedPlan.total)<=0.01){
    const ids=paymentIds(postponed);
    if(postponed.status==='مؤجل'&&postponed.date===''&&postponed.postponedFromDate===postponedPlan.expectedDate){
      already.push(postponedPlan.code);
    }else if(postponed.status==='ملغي'&&postponed.date===postponedPlan.expectedDate&&ids.has(postponedPlan.paymentId)&&Math.abs(paidTotal(postponed)-600)<=0.01){
      const before=clone(postponed);
      postponed.status='مؤجل';
      postponed.postponedFromDate=postponedPlan.expectedDate;
      postponed.postponedAt=at;
      postponed.resumedAt='';
      postponed.date='';
      delete postponed.depositCancellation;
      postponed.paid=paidTotal(postponed);
      postponed.updatedAt=at;
      applied.push(postponedPlan.code);
      changes.push({code:postponedPlan.code,before,after:clone(postponed),kind:'postpone'});
    }else skipped.push({code:postponedPlan.code,reason:'postponed_state_changed'});
  }else skipped.push({code:postponedPlan.code,reason:'postponed_booking_changed'});

  return {changed:changes.length>0,applied:[...new Set(applied)],already:[...new Set(already)],skipped,changes};
}

async function runBrowserRepair(){
  if(typeof document==='undefined')return;
  let tries=0;
  const timer=setInterval(async()=>{
    tries++;
    let db=null,currentUser=null,persistFn=null;
    try{db=root.db||eval('db')}catch(_){}
    try{currentUser=root.currentUser||eval('currentUser')}catch(_){}
    try{persistFn=root.persist||eval('persist')}catch(_){}
    if(!db||!currentUser||typeof persistFn!=='function'){if(tries>=40)clearInterval(timer);return}
    clearInterval(timer);
    db.resortAccount=root.ResortAccountCore?.normalizeAccount(db.resortAccount)||db.resortAccount||{};
    if(num(db.resortAccount.bookingReconciliationVersion)>=VERSION)return;
    try{
      const backupKey='adwaaPreBookingReconciliation-'+PLAN_DATE+'-'+Date.now();
      try{localStorage.setItem(backupKey,JSON.stringify(db))}catch(_){}
      const result=applyReconciliation(db,{at:new Date().toISOString()});
      db.resortAccount.bookingReconciliationVersion=VERSION;
      db.resortAccount.bookingReconciliationAt=new Date().toISOString();
      db.resortAccount.bookingReconciliationIssues=result.skipped.slice(0,50);
      if(typeof root.addAudit==='function'){
        for(const change of result.changes){
          root.addAudit('تصحيح موثق','حجز',change.code+' — مصالحة مالية 2026-09-22',change.before,change.after);
        }
        root.addAudit('مصالحة','المنظومة المالية',
          'مصالحة الحجوزات التاريخية: '+result.applied.length+' مصحح، '+result.already.length+' صحيح مسبقًا، '+result.skipped.length+' متجاوز للمراجعة',
          null,{version:VERSION,applied:result.applied,already:result.already,skipped:result.skipped});
      }
      await persistFn();
      root.__adwaaBookingReconciliationResult=result;
      root.dispatchEvent(new CustomEvent('adwaa-booking-reconciliation',{detail:result}));
    }catch(error){
      console.error('Booking reconciliation failed',error);
      root.__adwaaBookingReconciliationResult={error:String(error?.message||error)};
    }
  },250);
}

root.BookingFinancialReconciliation={VERSION,plans,postponedPlan,applyReconciliation};
if(typeof module!=='undefined'&&module.exports)module.exports={VERSION,plans,postponedPlan,applyReconciliation};
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',runBrowserRepair,{once:true});
  else runBrowserRepair();
}
})(typeof window!=='undefined'?window:globalThis);