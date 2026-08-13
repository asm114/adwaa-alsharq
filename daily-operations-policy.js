(()=>{
'use strict';
if(window.__adwaaDailyOperationsPolicyInstalled)return;
window.__adwaaDailyOperationsPolicyInstalled=true;

function fullyPaidCommissionBooking(booking){
  if(!booking||booking.recordType==='family'||booking.status==='ملغي')return false;
  const total=Number(booking.total||0),paid=Number(booking.paid||0);
  return Number.isFinite(total)&&Number.isFinite(paid)&&total>0&&paid>=total;
}

function installCommissionPolicy(){
  if(typeof window.commissionEligibility==='function'&&!window.commissionEligibility.__fullPaymentPolicy){
    const eligible=booking=>fullyPaidCommissionBooking(booking);
    eligible.__fullPaymentPolicy=true;
    try{commissionEligibility=eligible}catch(_){}
    window.commissionEligibility=eligible;
  }

  if(typeof window.normalizeBookingCommission==='function'&&!window.normalizeBookingCommission.__fullPaymentPolicy){
    const base=window.normalizeBookingCommission;
    const wrapped=function(raw,settings){
      const booking=base.call(this,raw,settings);
      if(!booking)return booking;
      const snapshot=booking.commissionSnapshot;
      if(snapshot?.status==='earned'&&!fullyPaidCommissionBooking(booking)){
        booking.commissionSnapshot=null;
        booking.commissionReceivedAt='';
        booking.commissionReceivedBy='';
      }
      return booking;
    };
    wrapped.__fullPaymentPolicy=true;wrapped.__base=base;
    try{normalizeBookingCommission=wrapped}catch(_){}
    window.normalizeBookingCommission=wrapped;
  }

  if(typeof window.commissionStatus==='function'&&!window.commissionStatus.__fullPaymentPolicy){
    const base=window.commissionStatus;
    const wrapped=function(booking){
      const status=base.call(this,booking);
      return status==='earned'&&!fullyPaidCommissionBooking(booking)?'not_earned':status;
    };
    wrapped.__fullPaymentPolicy=true;wrapped.__base=base;
    try{commissionStatus=wrapped}catch(_){}
    window.commissionStatus=wrapped;
  }

  if(typeof window.managerCommissionAmount==='function'&&!window.managerCommissionAmount.__fullPaymentPolicy){
    const base=window.managerCommissionAmount;
    const wrapped=function(booking){
      const status=typeof window.commissionStatus==='function'?window.commissionStatus(booking):'';
      return status==='not_earned'?0:base.call(this,booking);
    };
    wrapped.__fullPaymentPolicy=true;wrapped.__base=base;
    try{managerCommissionAmount=wrapped}catch(_){}
    window.managerCommissionAmount=wrapped;
  }

  if(typeof window.isCommissionEligible==='function'&&!window.isCommissionEligible.__fullPaymentPolicy){
    const wrapped=booking=>{
      const status=typeof window.commissionStatus==='function'?window.commissionStatus(booking):'';
      return status==='earned'||status==='received';
    };
    wrapped.__fullPaymentPolicy=true;
    try{isCommissionEligible=wrapped}catch(_){}
    window.isCommissionEligible=wrapped;
  }

  if(typeof window.outstandingCommissionTotal==='function'&&!window.outstandingCommissionTotal.__fullPaymentPolicy){
    const wrapped=rows=>(rows||[])
      .filter(booking=>typeof window.commissionStatus==='function'&&window.commissionStatus(booking)==='earned')
      .reduce((sum,booking)=>sum+(typeof window.managerCommissionAmount==='function'?window.managerCommissionAmount(booking):0),0);
    wrapped.__fullPaymentPolicy=true;
    try{outstandingCommissionTotal=wrapped}catch(_){}
    window.outstandingCommissionTotal=wrapped;
  }
}

function installCompletedStatusStyle(){
  if(typeof window.statusClass==='function'&&!window.statusClass.__completedStatusPolicy){
    const base=window.statusClass;
    const wrapped=status=>status==='تم الخروج'?'completed':base(status);
    wrapped.__completedStatusPolicy=true;wrapped.__base=base;
    try{statusClass=wrapped}catch(_){}
    window.statusClass=wrapped;
  }
  if(!document.getElementById('dailyOperationsPolicyStyle')){
    const style=document.createElement('style');
    style.id='dailyOperationsPolicyStyle';
    style.textContent=`
      .badge.completed{background:#e9eceb;color:#58625e}
      button[onclick*="transferOfficialSubscriptionToPortal"],
      button[onclick*="transferSubscriptionDraftToPortal"],
      button[onclick*="subscriptionControlTransfer"]{display:none!important}
    `;
    document.head.appendChild(style);
  }
}

async function automaticPortalSync(){
  if(typeof window.syncPortalAvailabilityFromBookings==='function')return window.syncPortalAvailabilityFromBookings();
  return false;
}

function installAutomaticPortalPolicy(){
  window.transferOfficialSubscriptionToPortal=automaticPortalSync;
  window.transferSubscriptionDraftToPortal=automaticPortalSync;
  window.subscriptionControlTransfer=automaticPortalSync;
}

function install(){
  installCommissionPolicy();
  installCompletedStatusStyle();
  installAutomaticPortalPolicy();
}

install();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
setTimeout(install,800);
})();
