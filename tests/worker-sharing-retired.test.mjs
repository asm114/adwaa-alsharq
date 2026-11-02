import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker-check-admin.js',import.meta.url),'utf8');
function harness(rows=[]){
  const cards=[];
  const root={querySelectorAll:()=>cards.slice(),prepend:card=>cards.push(card)};
  const document={readyState:'loading',addEventListener(){},querySelectorAll:()=>[],getElementById:id=>id==='alertsList'?root:null,createElement:()=>({innerHTML:'',querySelector:()=>({addEventListener(){}})})};
  const db={bookings:[{id:'b27',code:'AD-0027',date:'2026-11-01',status:'تم الخروج'}],cleaningTasks:[{id:'old',bookingId:'b27'}],notifications:[{id:'old-notice',message:'مشاركة تشيك عامل المنتجع'}]};
  const window={db,addEventListener(){}};
  const context=vm.createContext({window,document,console,Map,Intl,Date,setTimeout,clearTimeout});
  vm.runInContext(source.replace('window.shareWorkerCheck=shareWorkerCheck;',`window.testApi={renderWorkerAlerts,retireLegacyCleaningFunctions};backendAvailable=true;checksByBooking=new Map(${JSON.stringify(rows)});window.shareWorkerCheck=shareWorkerCheck;`),context);
  return {window,cards,db};
}
test('AD-0027 checkout, refresh and restored state never recreate worker sharing or mutate records',()=>{
  for(const rows of [[],[['b27',{status:'ready',shared_at:null}]], [['b27',{status:'reviewed'}]]]){
    const {window,cards,db}=harness(rows),before=JSON.stringify(db);
    window.testApi.retireLegacyCleaningFunctions();
    for(let i=0;i<3;i++)window.testApi.renderWorkerAlerts();
    assert.equal(cards.length,0);
    for(const name of ['shareWorkerCheck','createCleaningLink','sendCleaningTaskToJameel','createCleaningLinkFromModal'])assert.equal(window[name]('b27'),null);
    assert.equal(JSON.stringify(db),before);
  }
});
test('existing submitted worker reports remain accessible',()=>{
  const {window,cards}=harness([['b27',{status:'submitted'}]]);
  window.testApi.renderWorkerAlerts();
  assert.equal(cards.length,1);assert.match(cards[0].innerHTML,/فتح التقرير/);assert.doesNotMatch(cards[0].innerHTML,/مشاركة الرابط/);
});
test('popup excludes historical share cards but preserves unrelated alerts and report alerts',()=>{
  const source=readFileSync(new URL('../header-alerts-popup.js',import.meta.url),'utf8');
  const window={addEventListener(){}};const document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(source.replace('window.focusDashboardAlerts=', 'window.isRetiredWorkerShare=isRetiredWorkerShare;window.focusDashboardAlerts='),{window,document});
  for(const textContent of ['مشاركة تشيك عامل المنتجع','مشاركة تشييك عامل المنتجع','أرسل رابط التشييك للعامل.'])assert.equal(window.isRetiredWorkerShare({textContent}),true);
  for(const textContent of ['وصل تشييك عامل المنتجع','عمولة مستحقة','تأكيد خروج العميل'])assert.equal(window.isRetiredWorkerShare({textContent}),false);
});
test('sharing RPC and native sharing removed; cache namespace advanced',()=>{
  assert.doesNotMatch(source,/create_customer_portal_worker_check|navigator\.share|data-worker-share|مشاركة الرابط/);
  assert.match(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),/20261102-retired-share-1/);
});
