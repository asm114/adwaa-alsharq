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

export function createSyncHarness({bookings=[],periods=[],selectedBookingId=''}={}){
  let sequence=100;
  const rows=structuredClone(periods);
  const state={bookings:structuredClone(bookings)};
  const client={
    auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}},error:null})},
    rpc:async()=>({data:true,error:null}),
    from(){
      return{
        select(){return{order:async()=>({data:structuredClone(rows),error:null})}},
        insert(payload){
          return resultBuilder(async()=>{
            const overlap=rows.some(row=>payload.start_date<=row.end_date&&payload.end_date>=row.start_date);
            if(overlap)return{data:null,error:{message:'overlap conflict'}};
            const row={id:`generated-${sequence++}`,...payload};rows.push(row);return{data:structuredClone(row),error:null};
          });
        },
        delete(){
          return resultBuilder(async filters=>{
            for(let index=rows.length-1;index>=0;index--){
              if(filters.every(([key,value])=>String(rows[index][key]??'')===value))rows.splice(index,1);
            }
            return{error:null};
          });
        }
      };
    }
  };
  const document={
    readyState:'complete',
    addEventListener(){},
    getElementById(id){return id==='bId'?{value:selectedBookingId}:null},
    createElement(){return{dataset:{},setAttribute(){},appendChild(){},classList:{add(){},remove(){}}}},
    body:{appendChild(){}},head:{appendChild(){}}
  };
  const window={
    db:state,portalAdminClient:client,portalAdminAuthState:{ready:false},
    verifyPortalAdminSession:async()=>true,
    addEventListener(){},portalUnavailableStatus(){},
    persist:async()=>{context.lastSuccessfulWriteAt=String(Number(context.lastSuccessfulWriteAt)+1)},
    deleteBooking:async()=>{const index=state.bookings.findIndex(item=>item.id===selectedBookingId);if(index>=0)state.bookings.splice(index,1);await window.persist()}
  };
  window.window=window;window.document=document;window.queueMicrotask=queueMicrotask;
  window.setTimeout=()=>0;window.clearTimeout=()=>{};window.console=console;
  const context=vm.createContext({...window,window,document,remoteReady:true,lastSuccessfulWriteAt:'1'});
  vm.runInContext(source,context,{filename:'portal-booking-sync-stable.js'});
  return{
    state,rows,
    reconcile:()=>context.window.syncPortalAvailabilityFromBookings(),
    deleteBooking:async()=>{await context.window.deleteBooking();await new Promise(resolve=>setImmediate(resolve))},
    lastResult:()=>context.window.portalBookingSyncLastResult
  };
}
