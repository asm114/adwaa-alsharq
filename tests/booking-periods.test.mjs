import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function functionSource(name){
  const start=html.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const end=html.indexOf('\n}',start);
  return html.slice(start,end+2);
}
function harness(bookings=[],now='2026-10-13T12:00:00Z'){
  const elements=Object.fromEntries(['upcomingBookingCount','finishedBookingCount','otherBookingCount'].map(id=>[id,{textContent:''}]));
  const buttons=['upcoming','finished','other','all'].map(period=>({dataset:{bookingPeriod:period},classes:{},attributes:{},classList:{toggle(name,value){this.owner.classes[name]=value}},setAttribute(name,value){this.attributes[name]=value}}));
  buttons.forEach(button=>{button.classList.owner=button});
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]))}}
  const context=vm.createContext({Date:FixedDate,Intl,db:{bookings},search:{value:''},statusFilter:{value:''},bookingList:{innerHTML:''},itemHTML:b=>b.id+'|',document:{getElementById:id=>elements[id],querySelectorAll:()=>buttons}});
  vm.runInContext("let bookingPeriod='upcoming';\n"+['bookingPeriodFor','setBookingPeriod','renderBookings','bookingEndDate','addDaysISO','riyadhTodayISO'].map(functionSource).join('\n'),context);
  return {context,elements,buttons};
}
const booking=(id,date,status='مؤكد',extra={})=>({id,date,status,type:'يومي',name:'عميل',phone:'0501234567',code:id,...extra});

test('daily bookings stay upcoming today and finish on the following Riyadh day',()=>{
  const {context}=harness();
  for(const [date,expected] of [['2026-10-12','finished'],['2026-10-13','upcoming'],['2026-10-14','upcoming']])assert.equal(context.bookingPeriodFor(booking('a',date)),expected);
});
test('overnight stays use checkout date, including ongoing stays and month/year rollover',()=>{
  const {context}=harness();
  for(const [date,days,expected] of [['2026-10-10',2,'finished'],['2026-10-10',3,'upcoming'],['2026-10-10',4,'upcoming'],['2026-09-30',14,'upcoming']])assert.equal(context.bookingPeriodFor(booking('a',date,'تم الدخول',{type:'مبيت',stayDays:days})),expected);
  const year=harness([],'2027-01-01T12:00:00Z').context;
  assert.equal(year.bookingPeriodFor(booking('a','2026-12-31','مؤكد',{type:'مبيت'})),'upcoming');
});
test('cancelled and postponed bookings always stay separate, even without a date',()=>{
  const {context}=harness();
  for(const status of ['ملغي','مؤجل'])for(const date of ['','2026-01-01','2027-01-01'])assert.equal(context.bookingPeriodFor(booking('a',date,status,{type:'مبيت',stayDays:3})),'other');
});
test('checked out bookings finish even before their scheduled checkout',()=>{
  assert.equal(harness().context.bookingPeriodFor(booking('a','2026-10-15','تم الخروج',{type:'مبيت',stayDays:4})),'finished');
});
test('classification follows Riyadh midnight regardless of the device time zone',()=>{
  const {context}=harness([],'2026-10-13T21:00:00Z');
  assert.equal(context.riyadhTodayISO(),'2026-10-14');
  assert.equal(context.bookingPeriodFor(booking('a','2026-10-13')),'finished');
});
test('undated active records are not silently labelled finished',()=>{
  assert.equal(harness().context.bookingPeriodFor(booking('a','')),'upcoming');
});
test('tabs, counters, ordering, search and status filters preserve booking data',()=>{
  const bookings=[booking('late','2026-10-15','غير مؤكد'),booking('early','2026-10-14'),booking('past','2026-10-12'),booking('cancelled','2026-10-16','ملغي'),booking('postponed','','مؤجل')];
  const before=JSON.stringify(bookings);
  const {context,elements,buttons}=harness(bookings);
  context.renderBookings();
  assert.equal(context.bookingList.innerHTML,'early|late|');
  assert.deepEqual(Object.values(elements).map(el=>el.textContent),['(2)','(1)','(2)']);
  assert.equal(buttons[0].attributes['aria-pressed'],'true');
  context.setBookingPeriod('finished');assert.equal(context.bookingList.innerHTML,'past|');
  context.setBookingPeriod('other');assert.equal(context.bookingList.innerHTML,'cancelled|postponed|');
  context.setBookingPeriod('all');assert.equal(context.bookingList.innerHTML,'cancelled|late|early|past|postponed|');
  context.search.value='EARLY';context.renderBookings();assert.equal(context.bookingList.innerHTML,'early|');
  context.search.value='050123';context.statusFilter.value='مؤجل';context.renderBookings();assert.equal(context.bookingList.innerHTML,'postponed|');
  context.setBookingPeriod('invalid');assert.equal(context.bookingList.innerHTML,'postponed|');
  context.setBookingPeriod('upcoming');assert.match(context.bookingList.innerHTML,/لا توجد حجوزات/);
  assert.deepEqual(Object.values(elements).map(el=>el.textContent),['(2)','(1)','(2)']);
  assert.equal(JSON.stringify(bookings),before);
});
