import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const mainRepo=fs.existsSync(new URL('resort/portal.js',root));
const paths=mainRepo?['resort/','customer-portal/']:[''];

for(const path of paths){
  async function portal(){
    let rows=[],failure=false;
    const navigations=[],elements=new Map();
    const element=()=>({textContent:'',innerHTML:'',className:'',dataset:{},classList:{add(){},remove(){}},addEventListener(){},querySelectorAll:()=>[]});
    const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
    const client={from:()=>({select(){return this},order:async()=>({data:structuredClone(rows),error:failure?{message:'offline'}:null})})};
    const window={supabase:{createClient:()=>client},location:{assign:url=>navigations.push(url)}};
    const document={createElement:element,getElementById:get,addEventListener(){},body:{classList:{add(){},remove(){}}}};
    const context=vm.createContext({window,document,console,Intl,Date,Map});
    for(const [,id]of fs.readFileSync(new URL(path+'index.html',root),'utf8').matchAll(/\bid="([^"]+)"/g))context[id]=get(id);
    // Skip unrelated startup network calls; run the actual calendar/request code.
    const source=fs.readFileSync(new URL(path+'portal.js',root),'utf8').replace(/countCustomerPortalVisit\(\);\s*loadPortal\(\);\s*$/,'');
    vm.runInContext(source,context);
    vm.runInContext("portalContact={whatsapp_number:'966500000000'};calendarCursor=new Date(2026,9,1)",context);
    return{context,navigations,get,load:()=>vm.runInContext('loadUnavailablePeriods()',context),request:()=>vm.runInContext("submitBookingRequest('2026-10-18')",context),close:()=>{rows=[{id:'sync-owned',start_date:'2026-10-18',end_date:'2026-10-18'}]},fail:()=>{failure=true}};
  }
  test(`${path} does not allow selecting a day before availability has loaded`,async()=>{
    const h=await portal();
    assert.equal(vm.runInContext("isUnavailable('2026-10-18')",h.context),true);
    vm.runInContext("renderSelectedDay('2026-10-18',false)",h.context);
    assert.ok(!h.get('selectedDayCard').innerHTML.includes('id="bookingRequestButton"'));
  });
  test(`${path} synchronized closure disables the public calendar day and request URL`,async()=>{
    const h=await portal();h.close();assert.equal(await h.load(),true);
    assert.match(h.get('calendarGrid').innerHTML,/data-date="2026-10-18" disabled/);
    assert.equal(await h.request(),false);
    assert.equal(h.navigations.length,0);
  });
  test(`${path} request rechecks a day closed after it was selected`,async()=>{
    const h=await portal();await h.load();
    vm.runInContext("renderSelectedDay('2026-10-18',false)",h.context);
    assert.match(h.get('selectedDayCard').innerHTML,/<button id="bookingRequestButton"/);
    assert.ok(!h.get('selectedDayCard').innerHTML.includes('href="https://wa.me/'));
    h.close();assert.equal(await h.request(),false);
    assert.equal(h.navigations.length,0);
    assert.equal(vm.runInContext('selectedDateIso',h.context),null);
  });
  test(`${path} connection failure keeps known closures and blocks the selected day`,async()=>{
    const h=await portal();await h.load();h.fail();
    assert.equal(await h.request(),false);
    assert.equal(h.navigations.length,0);
    assert.match(h.get('calendarGrid').innerHTML,/data-date="2026-10-18" disabled/);
    assert.match(h.get('selectedDayCard').textContent,/تعذر التحقق/);
  });
  test(`${path} available day can send a WhatsApp enquiry only after fresh verification`,async()=>{
    const h=await portal();
    assert.equal(await h.request(),true);
    assert.equal(h.navigations.length,1);
    assert.match(h.navigations[0],/^https:\/\/wa.me\//);
  });
}
