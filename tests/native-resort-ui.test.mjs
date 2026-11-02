import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('native-resort-ui.js'),css=read('native-resort-ui.css');
test('new presentation layer retains original form submission and never writes business state',()=>{
 assert.doesNotMatch(js,/\.from\(|\.rpc\(|\bpersist\(|localStorage|\.reset\(|\.onsubmit\s*=|window\.saveBooking\s*=/);
 assert.match(read('index.html'),/id="bookingForm"[^>]+onsubmit="saveBooking\(event\)"/);
 assert.equal(read('index.html').match(/<script src="native-resort-ui\.js/g)?.length,1);
 assert.match(js,/addEventListener\('invalid'/);
 assert.match(js,/sectionStep\(section\)/);
});
test('calendar cells and controls are excluded from all new styling',()=>{
 assert.doesNotMatch(css,/#calendarView|\.calendar\b|\.day\b|#calendar\b/);
 assert.match(js,/active\?\.id!=='calendarView'/);
 assert.match(css,/not\(\.native-resort-active\) #nativeBookingSteps/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(min-width:761px\)/);
});
test('dynamic booking fieldsets map to the appropriate step without removing fields',()=>{
 const groups=js.match(/const groups=(\[[^;]+);/)[1];
 const sectionStep=js.match(/function sectionStep\(section\)\{[^\n]+\}/)[0];
 const context=vm.createContext({});vm.runInContext(`const groups=${groups};${sectionStep};this.stepFor=sectionStep;`,context);
 for(const [name,expected] of [['booking-customer-section',0],['booking-stay-section',0],['booking-payment-section',1],['booking-notes-section',2],['booking-special-request-section',2],['booking-send-section',3],['external-extension',-1]]){
  assert.equal(context.stepFor({classList:{contains:v=>v===name}}),expected);
 }
 assert.doesNotMatch(js,/section\.remove\(|form\.innerHTML\s*=/);
});
test('preview has no real SDK or persistent browser data and no sharing feature',()=>{
 const build=read('tools/design/build-preview.py');
 assert.match(build,/connect-src/);assert.match(build,/worker-src/);
 assert.match(build,/Object\.defineProperty\(window,'localStorage'/);
 assert.match(build,/design-memory-adapter/);
 assert.doesNotMatch(js,/shareWorkerCheck|createCleaningLink|مشاركة الرابط/);
});
