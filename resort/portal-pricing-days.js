(()=>{
'use strict';

function isHighDemandPortalDay(date){
  return date instanceof Date&&(date.getDay()===4||date.getDay()===5);
}

try{
  isWeekend=isHighDemandPortalDay;
}catch(_){
  window.isWeekend=isHighDemandPortalDay;
}

window.isPortalHighDemandDay=isHighDemandPortalDay;
})();
