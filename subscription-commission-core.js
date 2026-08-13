(()=>{
'use strict';
if(window.__adwaaSubscriptionCommissionCoreInstalled)return;
window.__adwaaSubscriptionCommissionCoreInstalled=true;

let normalizing=false;
let internalPersist=false;
const num=value=>Math.max(0,Number(value||0));
const nowIso=()=>new Date().toISOString();

function subscriptions(){return Array.isArray(window.db?.subscriptions)?window.db.subscriptions:[]}
function active(sub){return !!sub&&sub.paymentManaged===true&&!/ملغي|cancel/i.test(String(sub.status||''))}
function fullyPaid(sub){return active(sub)&&num(sub.total)>0&&num(sub.paid)>=num(sub.total)}
function settings(){return window.db?.settings||{}}
function commissionEnabled(){return settings().commissionEnabled!==false}
function method(){return ['per_booking','per_day','percentage'].includes(settings().commissionMethod)?settings().commissionMethod:'per_day'}
function rate(){return num(settings().commissionRate??100)}
function visits(sub){return Math.max(1,Number(sub?.visits||sub?.dates?.length||1))}
function calculate(sub){
  const m=method(),r=rate(),days=visits(sub),total=num(sub?.total);
  if(typeof window.calculateCommissionAmount==='function')return num(window.calculateCommissionAmount(m,r,days,total));
  if(m==='percentage')return Math.round(total*r)/100;
  if(m==='per_day')return r*days;
  return r;
}
function status(sub){
  const snap=sub?.commissionSnapshot;
  if(!snap)return 'not_earned';
  if(['received_before_system','legacy_received','received_pre_system'].includes(String(snap.status||'')))return 'received_before_system';
  if(snap.status==='received'||snap.received===true||snap.receivedAt)return 'received';
  if(snap.status==='no_commission')return 'no_commission';
  if(snap.status==='earned')return fullyPaid(sub)?'earned':'not_earned';
  return 'not_earned';
}
function amount(sub){
  const current=status(sub);
  return ['earned','received','received_before_system'].includes(current)?num(sub?.commissionSnapshot?.amount):0;
}
function snapshotFor(sub){
  const existing=sub?.commissionSnapshot&&typeof sub.commissionSnapshot==='object'?{...sub.commissionSnapshot}:null;
  const existingStatus=String(existing?.status||'');
  if(existing&&['received','received_before_system'].includes(existingStatus))return existing;
  if(existingStatus==='earned')return fullyPaid(sub)?existing:null;
  if(existingStatus==='no_commission')return existing;
  if(!commissionEnabled())return{method:method(),rate:0,days:visits(sub),bookingTotal:num(sub.total),amount:0,earnedAt:'',received:false,receivedAt:null,status:'no_commission',reason:'العمولة معطلة في الإعدادات'};
  if(!fullyPaid(sub))return existing;
  return{method:method(),rate:rate(),days:visits(sub),bookingTotal:num(sub.total),amount:calculate(sub),earnedAt:nowIso(),received:false,receivedAt:null,status:'earned',remindCommissionAt:null,lastCommissionPromptAt:null};
}
function same(a,b){try{return JSON.stringify(a??null)===JSON.stringify(b??null)}catch(_){return a===b}}
function normalizeOne(sub){
  if(!sub||sub.paymentManaged!==true)return false;
  const next=snapshotFor(sub),before=sub.commissionSnapshot??null;
  if(same(before,next))return false;
  sub.commissionSnapshot=next;
  if(!next||next.status!=='received'){
    sub.commissionReceivedAt=next?.receivedAt||'';
    sub.commissionReceivedBy=next?.receivedBy||'';
  }
  return true;
}
async function normalizeAll({persist=true}={}){
  if(normalizing)return false;
  normalizing=true;
  try{
    let changed=false;
    for(const sub of subscriptions())if(normalizeOne(sub))changed=true;
    if(changed&&persist&&typeof window.persist==='function'&&!internalPersist){
      internalPersist=true;
      try{await window.persist()}finally{internalPersist=false}
    }
    return changed;
  }finally{normalizing=false}
}

window.subscriptionCommissionStatus=status;
window.subscriptionCommissionAmount=amount;
window.subscriptionCommissionFullyPaid=fullyPaid;
window.normalizeSubscriptionCommissions=normalizeAll;

function initialize(){
  queueMicrotask(()=>normalizeAll().catch(error=>console.warn('تعذر تهيئة عمولات الاشتراكات',error)));
  window.addEventListener('adwaa-subscription-updated',()=>queueMicrotask(()=>normalizeAll().catch(error=>console.warn('تعذر تحديث عمولة الاشتراك',error))));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
