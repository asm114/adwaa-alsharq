import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../supabase-config.staging.js',import.meta.url),'utf8');

async function submit({portalResult=true,portalThrows=false,coreFails=false,recordType='family',days=1,status='مؤكد',existing=false,conflict=null}={}){
  const fields={bId:existing?'new-id':'',bCode:'100',bRecordType:recordType,bName:'PRIVATE',bPhone:'PRIVATE',bDate:'2026-10-18',bType:days>1?'مبيت':'يومي',bStayDays:String(days),bPaid:recordType==='family'?'0':'100',bTotal:recordType==='family'?'0':'500',bStatus:status,bNotes:''};
  const elements=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}]));
  const listeners={},statuses=[],events=[];
  let remote=null,writes=0;
  const builder={eq(){return builder},select(){return builder},maybeSingle:async()=>({data:{id:'main'},error:coreFails?{message:'core disconnected'}:null})};
  const client={from(){return{
    update(payload){writes++;events.push('core-write');if(!coreFails)remote=structuredClone(payload.data);return builder},
    select(){return{eq(){return{maybeSingle:async()=>{events.push('core-read');return{data:{data:remote},error:null}}}}}},
    upsert(){throw new Error('unexpected upsert')}
  }}};
  const window={__adwaaStateVersion:'2026-10-23T00:00:00.000Z',location:{hostname:'asm114.github.io',pathname:'/adwaa-alsharq/'},supabaseClient:client,
    __adwaaBookingSaveStability:{showStatus(...args){statuses.push(args)}},
    syncPortalAvailabilityFromBookings:async()=>{events.push('portal-sync');assert.ok(remote?.bookings.length);if(portalThrows)throw new Error('portal disconnected');return portalResult},
    BookingPaymentHistory:{prepareBookingForSave:booking=>booking}};
  const document={readyState:'complete',getElementById:id=>elements[id]||null,body:{classList:{add(){}}},
    addEventListener:(type,callback)=>{listeners[type]=callback},createElement:()=>({}),head:{appendChild:script=>{script.onload()}}};
  const context=vm.createContext({AbortController,setTimeout,clearTimeout,window,document,URL,console,crypto:{randomUUID:()=> 'new-id'},localStorage:{setItem(){}},
    currentUser:{id:'test'},persist:async()=>{},supabaseClient:client,STATE_ROW_ID:'main',lastConfirmedRemoteHash:'',renderDataProtectionSyncStatus:async()=>{},
    db:{bookings:existing?[{id:'new-id',code:'100',recordType:'family',date:'2026-10-18',status:'مؤكد',type:'يومي',stayDays:1,total:0,paid:0}]:[],seq:100,settings:{}},remoteReady:false,lastSuccessfulWriteAt:'',lastSuccessfulReadAt:'',lastSyncError:'',
    normalizeDB:value=>value,normalizeBookingCommission:value=>value,findBookingConflict:()=>conflict,nextAvailableDate:()=>null,
    addAudit(){},invalidateCaches(){},ensureCleaningTaskForBooking(){},markRemoteStateConfirmed:async()=>{},scheduleRenderAll(){},
    setSyncStatus(){},closeModal:()=>events.push('close'),alert:message=>events.push('alert:'+message)});
  window.persist=context.persist;
  vm.runInContext(fs.readFileSync(new URL('../booking-persist-update-path.js',import.meta.url),'utf8'),context);
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  listeners.submit({target:{id:'bookingForm'},preventDefault(){},stopImmediatePropagation(){}});
  for(let i=0;i<20&&window.__adwaaAuthoritativeBookingSaveBusy;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.__adwaaAuthoritativeBookingSaveBusy,false);
  return{context,window,statuses,events,writes,remote,elements};
}
for(const [recordType,days] of [['family',1],['family',3],['customer',1]])test(`authoritative submit synchronizes ${recordType} (${days} days) after confirmed core read`,async()=>{
  const h=await submit({recordType,days});
  assert.deepEqual(h.events,['core-write','core-read','portal-sync','close']);
  assert.equal(h.writes,1);
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.portalSynced,true);
  assert.equal(h.statuses.at(-1)[0],'success');
  assert.equal(h.remote.bookings[0].stayDays,days);
});
for(const portalThrows of [false,true])test(`portal failure is visible without rolling back or duplicating a saved record (throws=${portalThrows})`,async()=>{
  const h=await submit({portalResult:false,portalThrows});
  assert.equal(h.writes,1);
  assert.equal(h.context.db.bookings.length,1);
  assert.equal(h.elements.bId.value,'new-id');
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.ok,true);
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.portalSynced,false);
  assert.equal(h.statuses.at(-1)[0],'warning');
  assert.ok(h.events.some(event=>event.startsWith('alert:')));
  assert.ok(!h.events.includes('close'));
});
test('administrative connection failure never starts portal synchronization',async()=>{
  const h=await submit({coreFails:true});
  assert.ok(!h.events.includes('portal-sync'));
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.ok,false);
});
test('cancelling family presence can synchronize while another booking occupies the same day',async()=>{
  const h=await submit({existing:true,status:'ملغي',conflict:{id:'other',name:'Synthetic overlapping booking'}});
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.ok,true);
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.portalSynced,true);
  assert.equal(h.writes,1);
  assert.equal(h.remote.bookings[0].status,'ملغي');
});
test('active family presence still rejects overlapping bookings before any write',async()=>{
  const h=await submit({conflict:{id:'other',name:'Synthetic overlapping booking'}});
  assert.equal(h.window.__adwaaLastBookingSaveConfirmed.ok,false);
  assert.equal(h.writes,0);
  assert.ok(!h.events.includes('portal-sync'));
});
