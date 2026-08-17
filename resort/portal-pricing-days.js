(()=>{
'use strict';

function isHighDemandPortalDay(date){
  if(!date||typeof date.getDay!=='function')return false;
  const day=date.getDay();
  return day===4||day===5;
}

try{
  isWeekend=isHighDemandPortalDay;
}catch(_){
  window.isWeekend=isHighDemandPortalDay;
}

window.isPortalHighDemandDay=isHighDemandPortalDay;
})();
