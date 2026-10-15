import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../portal-booking-sync-stable.js',import.meta.url),'utf8');

function resultBuilder(run){
  const filters=[];
  const builder={
    eq(column,value){filters.push([column,String(value)]);return builder},
    select(){return builder},
    single:async()=>run(filters,true),
    then(resolve,reject){return Promise.resolve(run(filters,false)).then(resolve,reject)}
  };
  return builder;
}

export function createSyncHarness({bookings=[],periods=[],selectedBookingId='',today='2026-08-31',faults={},saveBooking=null,remoteBookings=null,exposeWindowState=true,storage=new Map(),onCoreRead=null}={}){
  let sequence=100;
  let coreReads=0;
  const rows=structuredClone(periods);
  const state={bookings:structuredClone(bookings)};
  const operations=[];
  const messages=[];
  const fail=name=>faults[name]?{message:`simulated ${name} failure`}:null;
  const client={
    auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}},error:null})},
    rpc:async()=>({data:true,error:null}),
    from(){
      return{
        select(){return{order:async()=>({data:structuredClone(rows),error:fail('portalRead')})}},
        update(payload){
          return resultBuilder(async filters=>{
            operations.push({action:'transfer',payload});
            if(fail('transfer'))return{data:null,error:fail('transfer')};
            const row=rows.find(row=>filters.every(([key,value])=>String(row[key]??'')===value));
            if(row)Object.assign(row,payload);
            return{data:row?structuredClone(row):null,error:null};
          });
        },
        insert(payload){
          return resultBuilder(async()=>{
            operations.push({action:'insert',payload});
            if(fail('insert'))return{data:null,error:fail('insert')};
            const overlap=rows.some(row=>payload.start_date<=row.end_date&&payload.end_date>=row.start_date);
            if(overlap)return{data:null,error:{message:'overlap conflict'}};
            const row={id:`generated-${sequence++}`,...payload};rows.push(row);return{data:structuredClone(row),error:null};
          });
        },
        delete(){
          return resultBuilder(async filters=>{
            operations.push({action:'delete',filters});
            if(fail('delete'))return{error:fail('delete')};
            if(faults.silentDelete)return{error:null};
            for(let index=rows.length-1;index>=0;index--){
              if(filters.every(([key,value])=>String(rows[index][key]??'')===value))rows.splice(index,1);
            }
            return{error:null};
          });
        }
      };
    }
  };
  const primaryClient={
    from(){return{select(){return{eq(){return{
      maybeSingle:async()=>{coreReads++;onCoreRead?.(state,coreReads);return{data:{data:{bookings:structuredClone(remoteBookings||state.bookings)},updated_at:'confirmed'},error:fail('coreRead')}}
    }}}}}}
  };
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const document={
    readyState:'complete',
    addEventListener(){},
    getElementById(id){return id==='bId'?{value:selectedBookingId}:id==='bCode'?{value:'new-code'}:null},
    createElement(){return{dataset:{},setAttribute(){},appendChild(){},addEventListener(){},classList:{add(){},remove(){}}}},
    body:{appendChild(){}},head:{appendChild(){}}
  };
  const window={
    db:exposeWindowState?state:undefined,supabaseClient:primaryClient,portalAdminClient:client,portalAdminAuthState:{ready:false},__portalSyncToday:today,
    verifyPortalAdminSession:async()=>true,
    addEventListener(){},portalUnavailableStatus(message,type){messages.push({message,type})},
    persist:async()=>{context.remoteReady=!faults.coreWrite;if(!faults.coreWrite)context.lastSuccessfulWriteAt=String(Number(context.lastSuccessfulWriteAt)+1)},
    saveBooking:async()=>{if(saveBooking)saveBooking(state);await window.persist()},
    deleteBooking:async()=>{const index=state.bookings.findIndex(item=>item.id===selectedBookingId);if(index>=0)state.bookings.splice(index,1);await window.persist()}
  };
  window.window=window;window.document=document;window.queueMicrotask=queueMicrotask;
  window.setTimeout=()=>0;window.clearTimeout=()=>{};window.console=console;
  const context=vm.createContext({...window,db:state,window,document,localStorage,remoteReady:true,lastSuccessfulWriteAt:'1'});
  vm.runInContext(source,context,{filename:'portal-booking-sync-stable.js'});
  return{
    state,rows,operations,messages,faults,context,storage,
    saveBooking:()=>context.window.saveBooking({preventDefault(){}}),
    reconcile:()=>context.window.syncPortalAvailabilityFromBookings(),
    deleteBooking:async()=>{await context.window.deleteBooking();await new Promise(resolve=>setImmediate(resolve))},
    lastResult:()=>context.window.portalBookingSyncLastResult
  };
}
