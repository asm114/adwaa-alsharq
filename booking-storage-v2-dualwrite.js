(()=>{
'use strict';
if(window.__adwaaBookingV2DualWriteInstalled)return;
window.__adwaaBookingV2DualWriteInstalled=true;

let enabled=false;
let originalPersist=null;
let persistQueue=Promise.resolve();
const committed=new Map();

function storage(){
  const value=window.__adwaaBookingStorageV2;
  if(!value)throw new Error('Booking storage v2 adapter is not loaded.');
  return value;
}
function bookingId(value){return String(value?.id||'').trim()}
function stable(value){
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function snapshot(bookings){
  committed.clear();
  for(const booking of Array.isArray(bookings)?bookings:[]){
    const id=bookingId(booking);
    if(id)committed.set(id,stable(booking));
  }
}
function currentBookings(){
  if(typeof db==='undefined'||!db)throw new Error('Application state is not available.');
  return Array.isArray(db.bookings)?db.bookings:[];
}
async function restoreAuthoritative(){
  const latest=await storage().load();
  if(typeof db!=='undefined'&&db)db.bookings=latest;
  snapshot(latest);
  if(typeof renderAll==='function')renderAll();
  return latest;
}

async function runPersist(args){
  const adapter=storage();
  const current=currentBookings();
  const currentMap=new Map(current.map(booking=>[bookingId(booking),booking]).filter(([id])=>id));
  const changed=[];
  for(const [id,booking] of currentMap){
    if(committed.get(id)!==stable(booking))changed.push(booking);
  }
  const removed=[...committed.keys()].filter(id=>!currentMap.has(id));

  try{
    for(const booking of changed)await adapter.save(booking);
    for(const id of removed)await adapter.remove(id);
  }catch(error){
    await restoreAuthoritative().catch(()=>{});
    throw error;
  }

  // v2 is authoritative. The existing persist path then mirrors the exact current
  // application booking list into app_state together with unrelated legacy state.
  // Snapshot before legacy persistence makes retries idempotent for v2 if app_state fails.
  snapshot(current);
  return originalPersist(...args);
}

async function preflight(){
  const adapter=storage();
  const authoritative=await adapter.load();
  const comparison=adapter.compareWithLegacy(currentBookings());
  return {authoritative,comparison};
}

async function install(options={}){
  if(options?.enable!==true)return {enabled:false,reason:'explicit_enable_required'};
  if(enabled)return {enabled:true,alreadyInstalled:true};
  if(typeof persist!=='function')throw new Error('Legacy persist function is not available.');

  const {authoritative,comparison}=await preflight();
  if(!comparison.ok){
    const error=new Error('Booking v2 preflight mismatch; dual-write was not enabled.');
    error.details=comparison;
    throw error;
  }

  snapshot(authoritative);
  originalPersist=persist;
  persist=function bookingV2DualWritePersist(...args){
    const task=persistQueue.then(()=>runPersist(args));
    persistQueue=task.catch(()=>{});
    return task;
  };
  enabled=true;
  return {enabled:true,comparison};
}

function uninstall(){
  if(enabled&&originalPersist){
    persist=originalPersist;
    originalPersist=null;
  }
  enabled=false;
  persistQueue=Promise.resolve();
  committed.clear();
  return {enabled:false};
}

window.__adwaaBookingV2DualWrite={
  preflight,
  install,
  uninstall,
  isEnabled:()=>enabled
};
})();
