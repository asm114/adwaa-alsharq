import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {createSyncHarness} from './helpers/portal-booking-sync-harness.mjs';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const portalRef='ztqqdjryvecscidxxbfe';
const coreRef='pgdvlklpyrvmwzitsmbw';

function element(){
  const listeners=new Map();
  return {
    textContent:'',innerHTML:'',className:'',hidden:false,disabled:false,value:'',
    classList:{add(){},remove(){}},dataset:{},
    addEventListener(name,handler){listeners.set(name,handler)},
    async dispatch(name,event={preventDefault(){}}){return listeners.get(name)?.(event)},
    querySelectorAll(){return []},
    reset(){this.value=''},
    removeAttribute(){},focus(){}
  };
}

function isolatedEnvironment(){
  const elements=new Map();
  const ids=new Proxy({}, {get(target,id){
    if(typeof id!=='string')return undefined;
    if(!elements.has(id))elements.set(id,element());
    return elements.get(id);
  }});
  const document={
    getElementById:id=>ids[id],
    createElement:()=>element(),
    body:{classList:{add(){},remove(){}}},
    addEventListener(){}
  };
  const storage=new Map();
  const localStorage={
    getItem:key=>storage.get(key)||null,
    setItem:(key,value)=>storage.set(key,value)
  };
  return {ids,document,localStorage,elements};
}

test('isolated portal loads data, marks booked dates unavailable and keeps backends separate',async()=>{
  const sync=createSyncHarness({today:'2026-09-27',bookings:[{
    id:'booking-preview',date:'2026-09-28',type:'يومي',status:'مؤكد',portalUnavailablePeriodIds:{}
  }]});
  assert.equal(await sync.reconcile(),true);
  assert.equal(sync.rows.length,1);
  const {ids,document,localStorage}=isolatedEnvironment();
  const calls=[];
  const datasets={
    customer_portal_resort_info:{resort_name:'منتجع تجريبي',features:['مسبح']},
    customer_portal_images:[],
    customer_portal_unavailable_periods:sync.rows,
    customer_portal_pricing:{weekday_price:900,weekend_price:1100},
    customer_portal_seasons:[],
    customer_portal_contact:{whatsapp_number:'966500000000',contact_hours:'مساءً'}
  };
  const query=table=>{
    const builder={
      select(){return builder},eq(){return builder},order(){return builder},
      async maybeSingle(){return {data:datasets[table],error:null}},
      then(resolve,reject){return Promise.resolve({data:datasets[table],error:null}).then(resolve,reject)}
    };
    return builder;
  };
  const window={supabase:{createClient(url){
    calls.push(url);
    if(!url.includes(portalRef)||url.includes(coreRef))throw new Error('Wrong backend');
    return {from:table=>query(table),rpc:async()=>({data:null,error:null})};
  }}};
  const context=vm.createContext({window,document,localStorage,crypto:{randomUUID:()=> 'test-visitor'},console,Intl,Date,Map,Number,String,...ids});
  // Browser element IDs are window globals; expose only those used by this entry point.
  const html=await read('../customer-portal/index.html');
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))context[id]=ids[id];
  vm.runInContext(await read('../customer-portal/portal.js'),context);
  await vm.runInContext('loadPortal()',context);
  vm.runInContext('calendarCursor=new Date(2026,8,1);renderCalendar()',context);
  assert.match(ids.portalConnectionStatus.textContent,/تم تحميل بيانات البوابة/);
  assert.match(ids.portalResortName.textContent,/تجريبي/);
  assert.match(ids.calendarGrid.innerHTML,/data-date="2026-09-28" disabled/);
  assert.match(ids.calendarGrid.innerHTML,/data-date="2026-09-29"/);
  assert.equal(vm.runInContext("isUnavailable('2026-09-28')",context),true);
  assert.equal(vm.runInContext("isUnavailable('2026-09-29')",context),false);
  vm.runInContext("renderSelectedDay('2026-09-29',false)",context);
  assert.match(ids.selectedDayCard.innerHTML,/طلب الحجز/);
  sync.state.bookings[0].status='ملغي';
  assert.equal(await sync.reconcile(),true);
  await vm.runInContext('loadUnavailablePeriods()',context);
  assert.equal(vm.runInContext("isUnavailable('2026-09-28')",context),false);
  assert.match(ids.calendarGrid.innerHTML,/data-date="2026-09-28"[^>]*aria-label/);
  assert.deepEqual(calls,[`https://${portalRef}.supabase.co`]);
});

test('isolated feedback submission writes only to an in-memory client',async()=>{
  const {ids,document,localStorage}=isolatedEnvironment();
  const calls=[];
  const window={supabase:{createClient(url){
    assert.equal(url,`https://${portalRef}.supabase.co`);
    return {rpc:async(name,args)=>{
      calls.push({name,args});
      if(name==='begin_customer_portal_feedback')return {data:[{feedback_id:'fake-id',upload_token:'fake-token'}],error:null};
      return {data:true,error:null};
    }};
  }}};
  const context=vm.createContext({window,document,localStorage,crypto:{randomUUID:()=> 'test-visitor'},console,Date,URL});
  vm.runInContext(await read('../customer-portal/feedback.js'),context);
  ids.feedbackCategory.value='general';
  ids.feedbackMessage.value='ملاحظة تجريبية';
  ids.feedbackName.value='عميل تجريبي';
  ids.feedbackContact.value='';
  await ids.feedbackForm.dispatch('submit');
  assert.deepEqual(calls.map(call=>call.name),['begin_customer_portal_feedback','finalize_customer_portal_feedback']);
  assert.match(ids.feedbackStatus.textContent,/تم إرسال ملاحظتك/);
});

test('isolated admin login does not authenticate against production',async()=>{
  const {ids,document}=isolatedEnvironment();
  const html=await read('../customer-portal/admin/index.html');
  const inline=html.match(/<script>\s*(const SUPABASE_URL=[\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline,'admin login script exists');
  let signedIn=false;
  const client={auth:{
    getUser:async()=>({data:{user:signedIn?{id:'test-admin',email:'test@example.invalid'}:null}}),
    signInWithPassword:async()=>{signedIn=true;return {error:null}}
  }};
  const window={supabase:{createClient(url){
    assert.equal(url,`https://${portalRef}.supabase.co`);
    return client;
  }}};
  const context=vm.createContext({window,document,console});
  vm.runInContext(inline,context);
  await vm.runInContext('refreshAdminUser()',context);
  assert.match(ids.adminAuthStatus.textContent,/سجل دخول المدير/);
  ids.adminEmail.value='test@example.invalid';
  ids.adminPassword.value='fake-password';
  await ids.adminLoginForm.dispatch('submit');
  assert.match(ids.adminAuthStatus.textContent,/test@example.invalid/);
});
