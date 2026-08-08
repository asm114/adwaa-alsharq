(()=>{
  'use strict';
  const original=window.normalizeDB;
  if(typeof original!=='function'||original.__subscriptionStateSafetyInstalled)return;
  const wrapped=function(value){
    const source=value&&typeof value==='object'?value:{};
    const normalized=original(value);
    normalized.subscriptions=Array.isArray(source.subscriptions)?source.subscriptions:[];
    normalized.subscriptionDrafts=Array.isArray(source.subscriptionDrafts)?source.subscriptionDrafts:[];
    return normalized;
  };
  wrapped.__subscriptionStateSafetyInstalled=true;
  window.normalizeDB=wrapped;
})();
