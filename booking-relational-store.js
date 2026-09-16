(()=>{
'use strict';
if(window.__adwaaRelationalBookingStore)return;
const OUTBOX_KEY='adwaa.booking.outbox.v2';
const HEALTH_INTERVAL=5*60*1000;
let healthTimer=null,realtimeChannel=null,flushInFlight=false;
const client=()=>typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
const uuid=()=>crypto.randomUUID();
const readOutbox=()=>{try{const x=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
const writeOutbox=rows=>localStorage.setItem(OUTBOX_KEY,JSON.stringify(rows));
const isTransient=err=>!err?.code||['PGRST000','PGRST001','PGRST002','PGRST003'].includes(String(err.code))||/network|fetch|timeout|offline/i.test(String(err?.message||err||''));

function rowToLegacy(row){
  const legacy=row?.legacy_payload&&typeof row.legacy_payload==='object'?{...row.legacy_payload}:{};
  return {...legacy,id:row.id,code:row.code,name:row.customer_name,phone:row.customer_phone||'',date:row.booking_date,endDate:row.end_date,type:row.booking_type,status:row.status,total:Number(row.total_amount||0),discount:Number(row.discount_amount||0),notes:row.notes||'',source:row.source||legacy.source||'',__relationalVersion:Number(row.version||1),__relationalUpdatedAt:row.updated_at};
}
async function fetchAll(){
  const c=client();if(!c)throw new Error('Supabase client unavailable');
  const {data,error}=await c.from('bookings').select('*').order('booking_date',{ascending:true}).order('code',{ascending:true});
  if(error)throw error;return (data||[]).map(rowToLegacy);
}
async function saveBooking(booking,{expectedVersion=null,idempotencyKey=uuid(),queueOnTransient=true}={}){
  const c=client();if(!c)throw new Error('Supabase client unavailable');
  const args={p_booking:booking,p_expected_version:expectedVersion,p_idempotency_key:idempotencyKey};
  const {data,error}=await c.rpc('save_booking_v2',args);
  if(error){
    if(queueOnTransient&&isTransient(error)){
      const rows=readOutbox();if(!rows.some(x=>x.idempotencyKey===idempotencyKey)){rows.push({kind:'booking',idempotencyKey,args,queuedAt:new Date().toISOString()});writeOutbox(rows)}
      return {ok:false,queued:true,error};
    }
    throw error;
  }
  return {ok:true,queued:false,booking:rowToLegacy(data),raw:data,idempotencyKey};
}
async function recordPayment(input){
  const c=client();if(!c)throw new Error('Supabase client unavailable');
  const key=input.idempotencyKey||uuid();
  const {data,error}=await c.rpc('record_booking_payment_v2',{p_booking_id:input.bookingId,p_payment_type:input.type||'payment',p_amount:Number(input.amount),p_method:input.method||null,p_paid_at:input.paidAt||new Date().toISOString(),p_note:input.note||null,p_idempotency_key:key});
  if(error)throw error;return {ok:true,payment:data,idempotencyKey:key};
}
async function recordRefund(input){
  const c=client();if(!c)throw new Error('Supabase client unavailable');
  const key=input.idempotencyKey||uuid();
  const {data,error}=await c.rpc('record_booking_refund_v2',{p_booking_id:input.bookingId,p_payment_id:input.paymentId||null,p_amount:Number(input.amount),p_method:input.method||null,p_refunded_at:input.refundedAt||new Date().toISOString(),p_note:input.note||null,p_idempotency_key:key});
  if(error)throw error;return {ok:true,refund:data,idempotencyKey:key};
}
async function flushOutbox(){
  if(flushInFlight)return {ok:false,busy:true};flushInFlight=true;
  try{
    const c=client();if(!c)return {ok:false};const rows=readOutbox(),keep=[];
    for(const item of rows){
      if(item.kind!=='booking'){keep.push(item);continue}
      const {error}=await c.rpc('save_booking_v2',item.args);
      if(error){keep.push(item);if(!isTransient(error))console.error('Relational outbox mutation failed',error)}
    }
    writeOutbox(keep);return {ok:true,pending:keep.length};
  }finally{flushInFlight=false}
}
async function healthCheck({record=false}={}){
  const c=client();if(!c)return {ok:false,error:'client-unavailable'};
  const {count,error}=await c.from('bookings').select('id',{count:'exact',head:true});
  const pending=readOutbox().length,status=error?'error':pending?'warning':'ok';
  if(record){try{await c.from('booking_sync_health').insert({source:'client',status,booking_count:count??null,pending_mutations:pending,details:error?{message:String(error.message||error)}:{}})}catch(_){}}
  return {ok:!error,status,count:count??null,pending,error:error||null,checkedAt:new Date().toISOString()};
}
function subscribe(onChange){
  const c=client();if(!c||typeof c.channel!=='function')return null;
  if(realtimeChannel)try{c.removeChannel(realtimeChannel)}catch(_){}
  realtimeChannel=c.channel('adwaa-relational-bookings').on('postgres_changes',{event:'*',schema:'public',table:'bookings'},payload=>{
    const row=payload.new?.id?rowToLegacy(payload.new):payload.old?.id?rowToLegacy(payload.old):null;
    onChange?.({eventType:payload.eventType,booking:row,raw:payload});
  }).subscribe();
  return realtimeChannel;
}
function startHealthMonitor(onHealth){
  stopHealthMonitor();
  const run=async()=>{const result=await healthCheck({record:true});onHealth?.(result);if(navigator.onLine)void flushOutbox()};
  void run();healthTimer=setInterval(run,HEALTH_INTERVAL);window.addEventListener('online',flushOutbox);
}
function stopHealthMonitor(){if(healthTimer){clearInterval(healthTimer);healthTimer=null}}
window.__adwaaRelationalBookingStore={rowToLegacy,fetchAll,saveBooking,recordPayment,recordRefund,flushOutbox,healthCheck,subscribe,startHealthMonitor,stopHealthMonitor,pendingCount:()=>readOutbox().length};
})();
