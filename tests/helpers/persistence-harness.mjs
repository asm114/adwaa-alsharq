import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../booking-persist-update-path.js',import.meta.url),'utf8');
export function harness(shared={row:{id:'main',data:{bookings:[],seq:1},updated_at:'2026-10-23T00:00:00.000Z'}},options={}){
 const state=options.state||{bookings:[{id:'b1',total:1200,paid:500,payments:[{id:'p1',amount:500}]}],seq:2};
 const control={writes:0,commits:0,reads:0,writeError:false,commit:true,readError:false,delay:null,hangRead:false,hashError:false,hashWait:false,status:[],queries:[]};
 Object.defineProperty(control,'remote',{get:()=>shared.row?.data,set:data=>{shared.row={id:'main',data,updated_at:shared.row?.updated_at||'2026-10-23T00:00:00.000Z'}}});
 const c={AbortController,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,options.deadline||12000)),clearTimeout,setInterval,clearInterval,db:structuredClone(state),currentUser:{id:'test'},persist:async()=>{},normalizeDB:x=>x,invalidateCaches(){},scheduleRenderAll(){},alert(){},showLogin(){},STATE_ROW_ID:'main',remoteReady:false,lastSuccessfulWriteAt:'',lastSyncError:'',lastConfirmedRemoteHash:'',renderDataProtectionSyncStatus:async()=>{},setSyncStatus:(...x)=>control.status.push(x),console:{warn(){},error(){}},markRemoteStateConfirmed:async()=>{if(control.hashWait)await new Promise(()=>{});if(control.hashError)throw Error('hash unavailable')}};
 c.window=c;
 c.supabaseClient={from(){let payload;const filters={};const q={
 update(p){payload=structuredClone(p);return q},eq(k,v){filters[k]=v;return q},select(){return q},abortSignal(){return q},
 async maybeSingle(){
  control.queries.push({write:!!payload,filters:structuredClone(filters)});
  if(!payload){control.reads++;if(control.hangRead)await new Promise(()=>{});if(control.readError)throw Error('offline');return{data:structuredClone(shared.row),error:null}}
  control.writes++;if(control.delay)await control.delay;
  // Model Postgres: the version predicate is checked atomically at commit time.
  if(filters.updated_at!==shared.row?.updated_at)return{data:null,error:null};
  if(control.commit){shared.row={id:'main',...structuredClone(payload)};control.commits++}
  if(control.writeError)throw Error('lost response');
  return{data:{id:'main',updated_at:payload.updated_at},error:null};
 }};return q}};
 if(options.rpc)c.supabaseClient.rpc=(name,args)=>{
  if(name!=='adwaa_cas_write_app_state_v1')throw Error('unexpected RPC');
  const next=new Date(Math.max(Date.now(),Date.parse(args.p_expected_updated_at)+1)).toISOString();
  return c.supabaseClient.from('app_state').update({data:args.p_data,updated_at:next}).eq('id','main').eq('updated_at',args.p_expected_updated_at);
 };
 vm.runInNewContext(options.source||source,c);c.AdwaaPersistence.acceptRemote(shared.row);
 return {c,control,shared};
}
