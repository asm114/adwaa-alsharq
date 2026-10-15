import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../resort/portal-pricing-days.js',import.meta.url),'utf8');
const marker='const HIJRI_NUMERIC_FORMATTER';
const markerIndex=source.indexOf(marker);
assert.notEqual(markerIndex,-1,'pricing classifier marker must remain present');
const classifierSource=`${source.slice(0,markerIndex)}\n})();`;

function loadClassifier(contextOverrides={}){
  const context={window:{},...contextOverrides};
  vm.createContext(context);
  vm.runInContext(classifierSource,context);
  return {context,classify:context.window.isPortalHighDemandDay};
}

test('customer portal prices Thursday and Friday as high-demand days only',()=>{
  const {classify}=loadClassifier();
  assert.equal(typeof classify,'function');
  assert.equal(classify(new Date('2026-08-13T12:00:00')),true,'Thursday must use high-demand price');
  assert.equal(classify(new Date('2026-08-14T12:00:00')),true,'Friday must use high-demand price');
  assert.equal(classify(new Date('2026-08-15T12:00:00')),false,'Saturday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-16T12:00:00')),false,'Sunday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-17T12:00:00')),false,'Monday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-18T12:00:00')),false,'Tuesday must use normal weekday price');
  assert.equal(classify(new Date('2026-08-19T12:00:00')),false,'Wednesday must use normal weekday price');
});

test('pricing override replaces the legacy portal isWeekend function',()=>{
  const legacy=()=>false;
  const {context}=loadClassifier({isWeekend:legacy});
  assert.notEqual(context.isWeekend,legacy);
  assert.equal(context.isWeekend(new Date('2026-08-13T12:00:00')),true);
  assert.equal(context.isWeekend(new Date('2026-08-15T12:00:00')),false);
});


function confirmationHarness({unavailable=false}={}){
  const nodes=new Map();
  const element=()=>{
    const classes=new Set(),attributes=new Map(),listeners=new Map();
    return {hidden:false,href:'',textContent:'',className:'',
      classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key),toggle(key,value){if(value)classes.add(key);else classes.delete(key)}},
      setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key),
      addEventListener:(key,fn)=>listeners.set(key,fn),focus(){},
      querySelector(selector){if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector)},
      dispatch(key){return listeners.get(key)?.({preventDefault(){},currentTarget:this})}
    };
  };
  let modal=null,blocked=unavailable,calls=0;
  const context={document:{getElementById:()=>modal,createElement:()=>element(),body:{appendChild:node=>{modal=node},classList:{add(){},remove(){}}},activeElement:null},
    dateAtNoon:iso=>new Date(iso+'T12:00:00'),getDayPricing:()=>null,getSaudiCalendarEvents:()=>[],
    portalContact:{whatsapp_number:'synthetic'},isUnavailable:()=>blocked,hasPublicPrice:()=>false,
    formatGregorian:iso=>iso,formatHijri:iso=>iso,
    submitBookingRequest:async()=>{calls++;blocked=true;return false}
  };
  const start=source.indexOf('function ensureBookingModal(){');
  const end=source.indexOf('\ninstallEnhancementStyles();',start);
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  context.openBookingConfirmation('2026-10-18',null);
  return{modal,button:modal.querySelector('#bookingConfirmationWhatsapp'),calls:()=>calls};
}

test('confirmation modal exposes no cached WhatsApp URL and rechecks on actual confirmation',async()=>{
  const h=confirmationHarness();
  assert.equal(h.button.href,'#');
  assert.equal(h.modal._bookingDate,'2026-10-18');
  await h.button.dispatch('click');
  assert.equal(h.calls(),1);
  assert.equal(h.modal.hidden,true,'newly occupied day closes the stale confirmation');
  assert.equal(h.button.getAttribute('aria-busy'),'false');
});
test('confirmation for an unavailable day cannot submit a request',async()=>{
  const h=confirmationHarness({unavailable:true});
  assert.equal(h.button.getAttribute('aria-disabled'),'true');
  await h.button.dispatch('click');
  assert.equal(h.calls(),0);
});
