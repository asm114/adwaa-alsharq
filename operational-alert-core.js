(function(root){
'use strict';
function workerShareEligible(booking,{today,hour,exitDate}={}){
  if(!booking||booking.recordType==='family'||booking.status!=='تم الخروج')return false;
  const effectiveExit=String(exitDate||booking.date||'').slice(0,10);
  const effectiveToday=String(today||'').slice(0,10);
  if(!effectiveExit||!effectiveToday||effectiveExit!==effectiveToday)return false;
  return Number(hour)>=6;
}
const api={workerShareEligible};
root.OperationalAlertCore=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
