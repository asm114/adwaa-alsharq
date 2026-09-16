(()=>{
'use strict';
if(window.__adwaaBookingStorageV2Installed)return;
window.__adwaaBookingStorageV2Installed=true;

const revisions=new Map();
let lastRows=[];

function client(){
  const value=window.supabaseClient;
  if(!value)throw new Error('Supabase client is not available.');
  return value;
}
function bookingId(value){return String(value?.id||value?.legacy_booking_id||'').trim()}
function stable(value){
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function rowBooking(row){return row?.legacy_payload&&typeof row.legacy_payload==='object'?row.legacy_payload:null}

async function load(){
  const {data,error}=await client()
    .from('reservations')
    .select('legacy_booking_id,booking_code,legacy_payload,revision,source_hash,updated_at')
    .not('legacy_booking_id','is',null);
  if(error)throw error;
  lastRows=Array.isArray(data)?data:[];
  revisions.clear();
  for(const row of lastRows){
    const id=String(row.legacy_booking_id||'').trim();
    if(id)revisions.set(id,Number(row.revision||0));
  }
  return lastRows.map(rowBooking).filter(Boolean);
}

function compareWithLegacy(legacyBookings){
  const legacy=Array.isArray(legacyBookings)?legacyBookings:[];
  const rowsById=new Map(lastRows.map(row=>[String(row.legacy_booking_id||''),row]));
  const missing=[];const mismatched=[];
  for(const booking of legacy){
    const id=bookingId(booking);
    const row=rowsById.get(id);
    if(!row){missing.push(id);continue}
    const candidate=rowBooking(row);
    if(stable(candidate)!==stable(booking))mismatched.push(id);
  }
  const legacyIds=new Set(legacy.map(bookingId));
  const extra=lastRows.map(row=>String(row.legacy_booking_id||'')).filter(id=>id&&!legacyIds.has(id));
  return {
    ok:missing.length===0&&mismatched.length===0&&extra.length===0&&legacy.length===lastRows.length,
    legacyCount:legacy.length,
    v2Count:lastRows.length,
    missing,
    mismatched,
    extra
  };
}

async function readCommitted(id){
  const {data,error}=await client()
    .from('reservations')
    .select('legacy_booking_id,booking_code,legacy_payload,revision,source_hash,updated_at')
    .eq('legacy_booking_id',id)
    .maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Supabase did not return the committed booking.');
  return data;
}

async function save(booking){
  const id=bookingId(booking);
  if(!id)throw new Error('Booking id is required.');
  const expected=revisions.has(id)?revisions.get(id):0;
  const {data,error}=await client().rpc('save_booking_v2',{
    p_booking:booking,
    p_expected_revision:expected
  });
  if(error)throw error;
  const result=Array.isArray(data)?data[0]:data;
  const nextRevision=Number(result?.revision||0);
  if(!nextRevision)throw new Error('Supabase did not return the new booking revision.');

  const committed=await readCommitted(id);
  if(Number(committed.revision||0)!==nextRevision){
    throw new Error('Supabase booking revision verification failed.');
  }
  if(stable(rowBooking(committed))!==stable(booking)){
    throw new Error('Supabase booking read-back verification failed.');
  }

  revisions.set(id,nextRevision);
  const index=lastRows.findIndex(row=>String(row.legacy_booking_id||'')===id);
  if(index>=0)lastRows[index]=committed;else lastRows.push(committed);
  return {...result,committed};
}

function revisionOf(id){return revisions.get(String(id||''))??null}
function reset(){revisions.clear();lastRows=[]}

window.__adwaaBookingStorageV2={
  load,
  compareWithLegacy,
  readCommitted,
  save,
  revisionOf,
  reset
};
})();
