(()=>{
'use strict';
if(window.__adwaaDemoLocalRuntimeInstalled)return;
window.__adwaaDemoLocalRuntimeInstalled=true;
if(!window.ADWAA_PUBLIC_DEMO)return;
if(!window.supabase?.createClient)throw new Error('مكتبة Supabase غير متاحة قبل تشغيل وضع العرض المحلي.');

const config=window.ADWAA_COMMERCIAL_CONFIG||{};
const coreUrl=String(config?.backends?.core?.url||window.ADWAA_SUPABASE_CONFIG?.url||'');
const portalUrl=String(config?.backends?.portal?.url||window.ADWAA_PORTAL_SUPABASE_CONFIG?.url||'');
const nativeCreateClient=window.supabase.createClient.bind(window.supabase);
const visitor={id:'00000000-0000-4000-8000-000000000001',email:'demo.visitor@example.invalid',role:'authenticated',aud:'authenticated'};
const session={access_token:'demo-local-only',token_type:'bearer',expires_in:86400,expires_at:4102444800,refresh_token:'demo-local-only',user:visitor};
const listeners=new Set();
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();
const isoOffset=days=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const atOffset=(days,hour=8)=>`${isoOffset(days)}T${String(hour).padStart(2,'0')}:00:00.000Z`;
const uuid=()=>crypto.randomUUID?.()||`demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function demoCoreData(){
  return {
    seq:5,
    auditLog:[],
    bookings:[
      {id:'11111111-1111-4111-8111-111111111111',code:'DEMO-101',date:isoOffset(0),name:'ضيف تجريبي 1',phone:'0000000000',type:'يومي',stayDays:1,paid:500,total:900,status:'تم الدخول',notes:'حجز وهمي للعرض فقط — لا يمثل عميلًا حقيقيًا.',photos:[],recordType:'customer',createdAt:atOffset(-2),updatedAt:atOffset(0),payments:[{id:'pay-demo-101',date:isoOffset(0),note:'عربون تجريبي',type:'deposit',order:0,amount:500,method:'transfer',createdAt:atOffset(0,7)}]},
      {id:'22222222-2222-4222-8222-222222222222',code:'DEMO-102',date:isoOffset(1),name:'ضيف تجريبي 2',phone:'0000000000',type:'يومي',stayDays:1,paid:300,total:800,status:'مؤكد',notes:'حجز وهمي قادم لشرح المتابعة.',photos:[],recordType:'customer',createdAt:atOffset(-1),updatedAt:atOffset(-1),payments:[{id:'pay-demo-102',date:isoOffset(-1),note:'عربون تجريبي',type:'deposit',order:0,amount:300,method:'cash',createdAt:atOffset(-1,9)}]},
      {id:'33333333-3333-4333-8333-333333333333',code:'DEMO-103',date:isoOffset(3),name:'ضيف تجريبي 3',phone:'0000000000',type:'يومي',stayDays:1,paid:0,total:750,status:'غير مؤكد',notes:'طلب تجريبي غير مؤكد لعرض حالات الحجوزات.',photos:[],recordType:'customer',createdAt:atOffset(0,8),updatedAt:atOffset(0,8),payments:[]},
      {id:'44444444-4444-4444-8444-444444444444',code:'DEMO-099',date:isoOffset(-2),name:'ضيف تجريبي سابق',phone:'0000000000',type:'يومي',stayDays:1,paid:850,total:850,status:'تم الخروج',notes:'حجز مكتمل وهمي لعرض السجل المالي.',photos:[],recordType:'customer',createdAt:atOffset(-4),updatedAt:atOffset(-2,18),payments:[{id:'pay-demo-099a',date:isoOffset(-4),note:'عربون تجريبي',type:'deposit',order:0,amount:300,method:'transfer',createdAt:atOffset(-4)},{id:'pay-demo-099b',date:isoOffset(-2),note:'سداد تجريبي',type:'final',order:1,amount:550,method:'transfer',createdAt:atOffset(-2,18)}]}
    ],
    expenses:[
      {id:'55555555-5555-4555-8555-555555555555',cat:'تشغيل',ref:'EXP-DEMO-01',date:isoOffset(-1),notes:'مصروف وهمي للعرض فقط',title:'مستلزمات تجريبية',amount:150,createdAt:atOffset(-1,10),updatedAt:atOffset(-1,10),externalRef:'',paymentMethod:'نقد'},
      {id:'66666666-6666-4666-8666-666666666666',cat:'صيانة',ref:'EXP-DEMO-02',date:isoOffset(0),notes:'مصروف وهمي للعرض فقط',title:'صيانة تجريبية',amount:80,createdAt:atOffset(0),updatedAt:atOffset(0),externalRef:'',paymentMethod:'نقد'}
    ],
    settings:{waNumber:'',calendarMode:'both',resortStatus:'occupied',commissionRate:100,commissionMethod:'per_day',commissionEnabled:true,resortStatusUpdated:atOffset(0,8),propertyName:'العرض التجريبي',propertyType:'منتجع'},
    backupHistory:[],cleaningTasks:[],customerNotes:{},notifications:[]
  };
}

function demoPortalTables(){
  return {
    customer_portal_resort_info:[{id:'main',resort_name:'منتجع العرض التجريبي',short_description:'نسخة تجريبية لعرض طريقة عمل نظام إدارة المنتجعات',detailed_description:'هذه نسخة عرض تحتوي على بيانات وهمية فقط ولا تمثل منشأة أو حجوزات أو عملاء حقيقيين.',checkin_time:'4:00 مساءً',checkout_time:'2:00 صباحًا',maps_url:'',whatsapp_url:'',instagram_url:'',resort_address:'موقع تجريبي — البيانات غير حقيقية',checkin_instructions:'تعليمات الدخول هنا للعرض فقط.',features:['مسبح','جلسة خارجية','مطبخ','إنترنت','مواقف'],booking_requests_open:false,closed_message:'هذه نسخة تجريبية للعرض فقط ولا تستقبل حجوزات حقيقية.',updated_at:nowIso(),updated_by:null}],
    customer_portal_images:[],
    customer_portal_unavailable_periods:[
      {id:'demo-unavailable-1',start_date:isoOffset(8),end_date:isoOffset(9),source_type:'manual',booking_id:null,created_at:nowIso(),updated_at:nowIso(),updated_by:null},
      {id:'demo-unavailable-2',start_date:isoOffset(16),end_date:isoOffset(16),source_type:'manual',booking_id:null,created_at:nowIso(),updated_at:nowIso(),updated_by:null}
    ],
    customer_portal_pricing:[{id:'main',weekday_price:700,weekend_price:900,updated_at:nowIso(),updated_by:null}],
    customer_portal_seasons:[{id:'demo-season-1',season_name:'موسم تجريبي',start_date:isoOffset(30),end_date:isoOffset(34),season_price:1100,is_active:true,created_at:nowIso(),updated_at:nowIso(),updated_by:null}],
    customer_portal_contact:[{id:'main',whatsapp_number:'00000000',maps_url:'https://example.invalid/maps',instagram_url:'https://example.invalid/instagram',email:'demo@example.invalid',contact_hours:'نسخة تجريبية — لا يوجد تواصل حقيقي',created_at:nowIso(),updated_at:nowIso(),updated_by:null}],
    customer_portal_visitor_counter:[{id:'main',total_count:128,updated_at:nowIso()}],
    customer_portal_feedback:[],
    customer_portal_activity_log:[],
    customer_portal_worker_checks:[]
  };
}

function storageKey(scope){return `adwaa_demo_local_${scope}_v3`}
function readStore(scope,seed){
  try{
    const raw=localStorage.getItem(storageKey(scope));
    if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&parsed.tables)return parsed}
  }catch(_){ }
  const value={tables:seed()};
  try{localStorage.setItem(storageKey(scope),JSON.stringify(value))}catch(_){ }
  return value;
}
function saveStore(scope,store){try{localStorage.setItem(storageKey(scope),JSON.stringify(store))}catch(_){ }}

function authApi(){
  return {
    getSession:async()=>({data:{session:clone(session)},error:null}),
    getUser:async()=>({data:{user:clone(visitor)},error:null}),
    signInWithPassword:async()=>({data:{user:clone(visitor),session:clone(session)},error:null}),
    signOut:async()=>({error:null}),
    onAuthStateChange(callback){
      if(typeof callback==='function'){
        listeners.add(callback);
        queueMicrotask(()=>{try{callback('INITIAL_SESSION',clone(session))}catch(_){}});
      }
      return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}};
    }
  };
}

function same(a,b){return a===b||String(a??'')===String(b??'')}
function compare(value,operator,target){
  if(operator==='eq')return same(value,target);
  if(operator==='neq')return !same(value,target);
  if(operator==='is')return target===null?value==null:same(value,target);
  if(operator==='in')return Array.isArray(target)&&target.some(item=>same(value,item));
  if(operator==='gte')return value>=target;
  if(operator==='lte')return value<=target;
  if(operator==='gt')return value>target;
  if(operator==='lt')return value<target;
  return true;
}

class LocalQuery{
  constructor(client,table){this.client=client;this.table=String(table||'');this.operation='select';this.payload=null;this.filters=[];this.orders=[];this.max=null;this.rangeValue=null;this.selection='*';this.countMode='';this.head=false;}
  select(columns='*',options={}){this.selection=columns;this.countMode=options?.count||'';this.head=options?.head===true;return this}
  eq(column,value){this.filters.push(['eq',column,value]);return this}
  neq(column,value){this.filters.push(['neq',column,value]);return this}
  is(column,value){this.filters.push(['is',column,value]);return this}
  in(column,values){this.filters.push(['in',column,values]);return this}
  gte(column,value){this.filters.push(['gte',column,value]);return this}
  lte(column,value){this.filters.push(['lte',column,value]);return this}
  gt(column,value){this.filters.push(['gt',column,value]);return this}
  lt(column,value){this.filters.push(['lt',column,value]);return this}
  match(values){for(const [key,value] of Object.entries(values||{}))this.eq(key,value);return this}
  order(column,{ascending=true}={}){this.orders.push([column,ascending]);return this}
  limit(value){this.max=Math.max(0,Number(value)||0);return this}
  range(from,to){this.rangeValue=[Math.max(0,Number(from)||0),Math.max(0,Number(to)||0)];return this}
  insert(values){this.operation='insert';this.payload=values;return this}
  upsert(values){this.operation='upsert';this.payload=values;return this}
  update(values){this.operation='update';this.payload=values;return this}
  delete(){this.operation='delete';return this}
  maybeSingle(){return this.execute(true)}
  single(){return this.execute(true,true)}
  then(resolve,reject){return this.execute(false).then(resolve,reject)}
  catch(reject){return this.execute(false).catch(reject)}
  rows(){
    const source=this.client.rows(this.table);
    let rows=source.filter(row=>this.filters.every(([op,column,target])=>compare(row?.[column],op,target)));
    for(const [column,ascending] of [...this.orders].reverse())rows.sort((a,b)=>{const av=a?.[column],bv=b?.[column];if(av===bv)return 0;return (av>bv?1:-1)*(ascending?1:-1)});
    if(this.rangeValue)rows=rows.slice(this.rangeValue[0],this.rangeValue[1]+1);
    if(this.max!=null&&this.max>0)rows=rows.slice(0,this.max);
    return rows;
  }
  async execute(single=false,strict=false){
    try{
      const table=this.client.rows(this.table);
      let affected=[];
      if(this.operation==='select')affected=this.rows();
      else if(this.operation==='insert'){
        const items=(Array.isArray(this.payload)?this.payload:[this.payload]).filter(Boolean).map(value=>({...clone(value),id:value?.id||uuid(),created_at:value?.created_at||nowIso(),updated_at:value?.updated_at||nowIso()}));
        table.push(...items);affected=items;this.client.persist();
      }else if(this.operation==='upsert'){
        const items=(Array.isArray(this.payload)?this.payload:[this.payload]).filter(Boolean);
        for(const raw of items){const value=clone(raw);const id=value.id||((this.table.endsWith('_info')||this.table.endsWith('_pricing')||this.table.endsWith('_contact'))?'main':uuid());value.id=id;let index=table.findIndex(row=>same(row.id,id));if(index<0&&value.booking_id)index=table.findIndex(row=>same(row.booking_id,value.booking_id));if(index>=0){table[index]={...table[index],...value,updated_at:value.updated_at||nowIso()};affected.push(table[index])}else{const row={...value,created_at:value.created_at||nowIso(),updated_at:value.updated_at||nowIso()};table.push(row);affected.push(row)}}this.client.persist();
      }else if(this.operation==='update'){
        const matches=this.rows();for(const row of matches){Object.assign(row,clone(this.payload||{}));if(Object.prototype.hasOwnProperty.call(row,'updated_at'))row.updated_at=this.payload?.updated_at||nowIso()}affected=matches;this.client.persist();
      }else if(this.operation==='delete'){
        const matches=new Set(this.rows());affected=[...matches];const keep=table.filter(row=>!matches.has(row));this.client.replaceRows(this.table,keep);this.client.persist();
      }
      const count=this.countMode?affected.length:null;
      if(this.head)return {data:null,error:null,count};
      const data=single?(affected[0]?clone(affected[0]):null):clone(affected);
      if(strict&&single&&!data)return {data:null,error:{message:'No rows found in local demo state',code:'PGRST116'},count};
      return {data,error:null,count};
    }catch(error){return {data:single?null:[],error,count:null}}
  }
}

function localStorageApi(){
  return {from(){return {
    upload:async(path)=>({data:{path:String(path||'demo-file')},error:null}),
    remove:async()=>({data:[],error:null}),
    createSignedUrl:async()=>({data:{signedUrl:'https://example.invalid/demo-file'},error:null}),
    createSignedUrls:async(paths)=>({data:(paths||[]).map(path=>({path,signedUrl:'https://example.invalid/demo-file'})),error:null}),
    getPublicUrl:path=>({data:{publicUrl:`https://example.invalid/${encodeURIComponent(String(path||'demo-file'))}`}})
  }}};
}

function makeClient(scope,seed){
  const store=readStore(scope,seed);
  const client={
    __adwaaLocalDemoClient:true,
    auth:authApi(),
    storage:localStorageApi(),
    rows(table){if(!Array.isArray(store.tables[table]))store.tables[table]=[];return store.tables[table]},
    replaceRows(table,rows){store.tables[table]=rows},
    persist(){saveStore(scope,store)},
    from(table){return new LocalQuery(client,table)},
    rpc:async(name,args={})=>{
      if(name==='is_resort_admin')return {data:true,error:null};
      if(name==='create_customer_portal_worker_check')return {data:null,error:{message:'مشاركة رابط العامل معطلة في النسخة التجريبية.'}};
      if(name==='increment_customer_portal_visitor'){return {data:true,error:null}}
      return {data:null,error:null};
    },
    channel(){const channel={on(){return channel},subscribe(){return channel},unsubscribe:async()=>({status:'ok'})};return channel},
    removeChannel:async()=>({data:null,error:null})
  };
  return client;
}

const coreClient=makeClient('core',()=>({app_state:[{id:'main',data:demoCoreData(),updated_at:nowIso()}]}));
const portalClient=makeClient('portal',demoPortalTables);
window.supabase.createClient=function(url,key,options){
  const target=String(url||'');
  if(target===coreUrl)return coreClient;
  if(target===portalUrl)return portalClient;
  return nativeCreateClient(url,key,options);
};
window.__ADWAA_DEMO_VISITOR__=Object.freeze({localOnly:true,user:clone(visitor)});
})();