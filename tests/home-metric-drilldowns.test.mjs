import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const js=await readFile(new URL('../home-metric-drilldowns.js',import.meta.url),'utf8');
const css=await readFile(new URL('../home-metric-drilldowns.css',import.meta.url),'utf8');
const loader=await readFile(new URL('../home-dashboard-polish.js',import.meta.url),'utf8');

const metricIds=['sMonth','sUpcoming','sDue','sRevenueMonth','sTotal','sToday','sWeek','sRevenueToday','sPending','sCommission','sPaid','sFullyPaid'];

test('all dashboard metrics expose drill-downs',()=>{
  for(const id of metricIds)assert.match(js,new RegExp(`\\b${id}\\b`));
  assert.match(js,/sRevenueMonth[\s\S]*mode:'paid'/);
  assert.match(js,/sDue[\s\S]*mode:'due-simple'/);
  assert.match(js,/sCommission[\s\S]*mode:'commission'/);
});

test('drill-down layer is reversible and loaded independently',()=>{
  assert.match(loader,/home-metric-drilldowns\.css\?v=20260822-1/);
  assert.match(loader,/home-metric-drilldowns\.js\?v=20260822-1/);
  assert.match(loader,/dataset\.homeMetricDrilldowns/);
  assert.match(js,/homeMetricDrilldownModal/);
});

test('drill-downs do not write business data or alter the calendar',()=>{
  assert.doesNotMatch(js,/persist\s*\(|supabase|insert\s*\(|update\s*\(|delete\s*\(/i);
  const strippedCss=css.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(strippedCss,/(^|[\s,{])\.calendar\b/m);
  assert.doesNotMatch(strippedCss,/(^|[\s,{])\.day\b/m);
});
