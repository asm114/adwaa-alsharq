import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../app-experience-pro.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');
const homeCss=await readFile(new URL('../home-dashboard-polish.css',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const simplified=await readFile(new URL('../simplified-ui.js',import.meta.url),'utf8');
const mobile=await readFile(new URL('../simplified-ui-mobile.css',import.meta.url),'utf8');
const professional=await readFile(new URL('../professional-ui-stable.js',import.meta.url),'utf8');
const quickBackup=await readFile(new URL('../quick-home-backup.js',import.meta.url),'utf8');
const browserControls=await readFile(new URL('../browser-controls.js',import.meta.url),'utf8');
const professionalCss=await readFile(new URL('../professional-ui-cleanup.css',import.meta.url),'utf8');

test('professional app experience is isolated to visual styling',()=>{
  assert.match(css,/body\.simplified-ui/);
  assert.doesNotMatch(css,/supabase|localStorage|customer_portal|booking_id|persist\s*\(/i);
  assert.match(loader,/app-experience-pro\.css\?v=20260817-2/);
  assert.match(loader,/classList\.toggle\('simple-view-home'/);
});

test('mobile app experience protects touch, safe areas, and iOS form zoom',()=>{
  assert.match(css,/--app-tap:48px/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/font-size:16px!important/);
  assert.match(css,/touch-action:manipulation/);
});

test('app experience supports reduced motion and clear keyboard focus',()=>{
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/:focus-visible/);
});

test('home is a daily command center in the approved mobile order',()=>{
  const status=index.indexOf('id="resortStatusCard"');
  const today=index.indexOf('id="todayBoard"');
  const next=index.indexOf('id="nextBookingSection"');
  const alerts=index.indexOf('id="dashboardAlerts"');
  const quick=index.indexOf('home-quick-actions');
  const metrics=index.indexOf('home-metrics');
  assert.ok(status<today&&today<next&&next<alerts&&alerts<quick&&quick<metrics);
  assert.doesNotMatch(index.slice(status,index.indexOf('</section>',metrics)+10),/أفضل العملاء|التحليلات الشهرية|أقرب الحجوزات/);
  assert.match(index,/لا توجد إجراءات عاجلة الآن/);
});

test('mobile never hides the daily operations surface',()=>{
  assert.doesNotMatch(mobile,/simple-home-mobile-hidden/);
  assert.doesNotMatch(simplified,/simple-home-mobile-hidden/);
  assert.match(homeCss,/@media\(max-width:620px\)/);
});

test('home identity uses the approved accessible palette and drawer is inert when closed',()=>{
  assert.match(homeCss,/--home-green:#0f5b4c/);
  assert.match(homeCss,/--home-gold-text:#9a6a16/);
  assert.match(homeCss,/--home-muted:#61706b/);
  assert.match(simplified,/drawer\.inert=true/);
  assert.match(simplified,/aria-current/);
});

test('legacy enhancements do not reintroduce forbidden header actions',()=>{
  assert.doesNotMatch(professional,/querySelector\('header \.icon-btn'\)/);
  assert.match(professional,/getElementById\('headerAddBooking'\)/);
  assert.doesNotMatch(quickBackup,/createElement\('button'\)/);
  assert.match(browserControls,/activeView\(\)===['"]dashboard['"]/);
  assert.match(browserControls,/button\.hidden=hide;button\.inert=hide/);
  assert.doesNotMatch(professionalCss,/header \.icon-btn/);
});

test('booking modal actions name their real behavior and preserve the existing save path',()=>{
  const modal=index.slice(index.indexOf('id="bookingModal"'),index.indexOf('id="helpPopover"'));
  assert.match(modal,/onsubmit="saveBooking\(event\)"/);
  assert.match(modal,/type="submit" form="bookingForm">حفظ الحجز<\/button>/);
  assert.match(modal,/onclick="closeBookingAndReturn\(\)">↩ رجوع بدون حفظ<\/button>/);
  assert.match(modal,/onclick="refreshBookingData\(\)">⟳ تحديث من المصدر<\/button>/);
  assert.doesNotMatch(modal,/onclick="backToBookingDetails\(\)"/);
  assert.doesNotMatch(modal,/حفظ التعديلات/);
  assert.doesNotMatch(professional,/button\.textContent='حفظ التعديلات'/);
});

test('booking modal has semantic sections, connected labels, required cues, and scoped readonly styling',()=>{
  const modal=index.slice(index.indexOf('id="bookingModal"'),index.indexOf('id="helpPopover"'));
  for(const heading of ['بيانات العميل','تفاصيل الحجز/الإقامة','الدفع','الملاحظات والصور','الإرسال']){
    assert.match(modal,new RegExp(`<legend>${heading}<\\/legend>`));
  }
  for(const id of ['bRecordType','bName','bPhone','bDate','bType','bStayDays','bStatus','bCode','bPaid','bTotal','bNotes','photoType','photoUploaderName']){
    assert.match(modal,new RegExp(`<label[^>]+for="${id}"`));
  }
  assert.equal((modal.match(/class="booking-required"/g)||[]).length,2);
  assert.match(index,/#bookingModal input\[readonly\]/);
  assert.match(modal,/role="dialog" aria-modal="true" aria-labelledby="bookingModalTitle"/);
});

test('booking modal keeps its header and real save action outside the scrolling content',()=>{
  const modal=index.slice(index.indexOf('id="bookingModal"'),index.indexOf('id="helpPopover"'));
  const scrollStart=modal.indexOf('class="booking-modal-scroll"');
  const footerStart=modal.indexOf('class="booking-modal-actions"');
  assert.ok(scrollStart>0&&footerStart>scrollStart);
  assert.match(modal,/class="booking-modal-actions"[\s\S]*type="submit" form="bookingForm">حفظ الحجز/);
  assert.match(index,/#bookingModal \.sheet\{display:grid;grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(index,/#bookingModal \.booking-modal-scroll\{[^}]*overflow-y:auto/);
  assert.match(index,/#bookingModal \.booking-modal-actions\{position:sticky;bottom:0/);
  assert.match(index,/#bookingModal \.help-icon\{[^}]*width:44px!important;[^}]*height:44px!important/);
  const buttonLabels=[...modal.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map(match=>match[1].trim()).filter(Boolean);
  assert.deepEqual(buttonLabels.filter(label=>label.startsWith('حفظ')),['حفظ الحجز']);
});
