/* Workspace loader: preserve the existing presentation layer, then add health diagnostics. */
(()=>{
'use strict';
function load(src,onload){const script=document.createElement('script');script.src=src;script.defer=false;if(onload)script.onload=onload;document.head.append(script)}
load('admin-workspace-core.js?v=20261006-2',()=>load('health-booking-diagnostics.js?v=20261001-1',()=>load('installment-purchases.js?v=20261006-1',()=>load('maintenance-open-cost.js?v=20261006-1'))));
})();
