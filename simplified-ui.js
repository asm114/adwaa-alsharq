(()=>{
'use strict';
if(window.__adwaaSimplifiedUiInstalled)return;
window.__adwaaSimplifiedUiInstalled=true;
const SIMPLE_UI_BUILD='20260806.4';

const PRIMARY_LABELS=['الرئيسية','الحجوزات','التقويم','العملاء','المالية','المصاريف'];
const VIEW_CLASS_MAP={الرئيسية:'home',الحجوزات:'bookings',التقويم:'calendar',العملاء:'customers',المالية:'finance',المصاريف:'finance'};
const DESCRIPTIONS={
  'بوابة العملاء':'إدارة الصور والأسعار والمحتوى',
  'الإعدادات':'إعدادات النظام والنسخ والحماية',
  'المصاريف':'إدارة المصروفات والتصنيفات',
  'التنظيف':'مهام التنظيف والمتابعة',
  'العمولات':'متابعة العمولة والاستلام',
  'الحماية':'فحص النظام وحماية البيانات',
  'حول النظام':'الإصدار ومعلومات التحديث',
  'الملاحظات':'الشكاوى والملاحظات الواردة'
};

function normalize(text){return String(text||'').replace(/\s+/g,' ').trim()}
function navLabel(button){
  const clone=button.cloneNode(true);
  clone.querySelectorAll('b,svg,img').forEach(el=>el.remove());
  return normalize(clone.textContent)||normalize(button.textContent);
}
function isPrimary(label){return PRIMARY_LABELS.some(item=>label.includes(item))}
function description(label){const key=Object.keys(DESCRIPTIONS).find(item=>label.includes(item));return key?DESCRIPTIONS[key]:'أداة إضافية من النظام'}
function iconFrom(button){return button.querySelector('b')?.textContent?.trim()||'•'}
function displayLabel(label){return label.includes('المصاريف')?'المالية':label}

function addStylesheet(){
  const old=document.querySelector('link[data-simplified-ui]');
  if(old&&old.href.includes(SIMPLE_UI_BUILD))return;
  old?.remove();
  const link=document.createElement('link');link.rel='stylesheet';link.href=`simplified-ui.css?v=${SIMPLE_UI_BUILD}`;link.dataset.simplifiedUi='1';document.head.appendChild(link);
}

function enhanceHeader(){
  const header=document.querySelector('header');if(!header)return;
  const subtitle=header.querySelector('.subtitle');
  if(subtitle&&!document.getElementById('simpleHeaderChip')){
    const chip=document.createElement('span');chip.id='simpleHeaderChip';chip.className='simple-ui-chip';chip.textContent='واجهة يومية';subtitle.insertAdjacentElement('afterend',chip);
  }
}

function setViewClass(label){
  [...document.body.classList].filter(name=>name.startsWith('simple-view-')).forEach(name=>document.body.classList.remove(name));
  const key=Object.keys(VIEW_CLASS_MAP).find(item=>label.includes(item));
  const view=key?VIEW_CLASS_MAP[key]:'other';
  document.body.classList.add(`simple-view-${view}`);
  if(view==='home')setTimeout(compactHome,20);
}

function clickNav(label){
  const nav=document.querySelector('nav');if(!nav)return;
  const button=[...nav.querySelectorAll(':scope > button')].find(item=>navLabel(item).includes(label));
  button?.click();
}
function addBooking(){
  const primary=document.querySelector('header .icon-btn');
  if(primary){primary.click();return}
  const button=[...document.querySelectorAll('button')].find(item=>normalize(item.textContent).includes('حجز جديد'));
  button?.click();
}

function compactHome(){
  const home=document.querySelector('.view.active');
  if(!home||document.body.classList.contains('simple-view-home')===false)return false;
  let dashboard=document.getElementById('simpleHomeDashboard');
  if(!dashboard){
    dashboard=document.createElement('section');dashboard.id='simpleHomeDashboard';dashboard.className='simple-home-dashboard';
    dashboard.innerHTML='<div class="simple-home-title"><div><span>ملخص اليوم</span><h2>كل المهم في شاشة واحدة</h2></div><div class="simple-home-date"></div></div><div class="simple-home-stats"></div><div class="simple-home-actions"><button type="button" data-action="booking">＋ إضافة حجز</button><button type="button" data-action="calendar">▦ عرض التقويم</button><button type="button" data-action="customers">♟ العملاء</button><button type="button" data-action="finance">◫ المالية</button></div>';
    dashboard.querySelector('[data-action="booking"]').addEventListener('click',addBooking);
    dashboard.querySelector('[data-action="calendar"]').addEventListener('click',()=>clickNav('التقويم'));
    dashboard.querySelector('[data-action="customers"]').addEventListener('click',()=>clickNav('العملاء'));
    dashboard.querySelector('[data-action="finance"]').addEventListener('click',()=>{clickNav('المالية');clickNav('المصاريف')});
    home.prepend(dashboard);
  }else if(dashboard.parentElement!==home){home.prepend(dashboard)}
  const date=dashboard.querySelector('.simple-home-date');
  if(date)date.textContent=new Date().toLocaleDateString('ar-SA',{weekday:'long',day:'numeric',month:'long'});
  const statRoot=dashboard.querySelector('.simple-home-stats');
  const stats=[...home.querySelectorAll('.stat')].filter(item=>!statRoot.contains(item)).slice(0,4);
  stats.forEach(item=>statRoot.appendChild(item));
  [...home.querySelectorAll('.section,article,section')].forEach(item=>{
    if(item===dashboard||dashboard.contains(item))return;
    const text=normalize(item.querySelector('h2,h3,h4')?.textContent||'');
    if(/التحليلات الشهرية|الإيرادات الشهرية|عدد الحجوزات شهري|نسبة الإشغال|آخر 12 شهر/.test(text))item.classList.add('simple-home-analytics-hidden');
  });
  return true;
}

function createDrawer(extraButtons){
  document.getElementById('simpleMoreOverlay')?.remove();
  const overlay=document.createElement('div');overlay.id='simpleMoreOverlay';overlay.className='simple-more-overlay';
  const drawer=document.createElement('aside');drawer.className='simple-more-drawer';drawer.setAttribute('aria-label','المزيد');
  drawer.innerHTML='<div class="simple-more-head"><h2>المزيد</h2><button class="simple-more-close" type="button" aria-label="إغلاق">×</button></div><div class="simple-more-group-title">أدوات إضافية</div><div class="simple-more-list"></div>';
  const list=drawer.querySelector('.simple-more-list');
  extraButtons.forEach(original=>{
    const label=navLabel(original);if(!label)return;
    const item=document.createElement('button');item.type='button';item.className='simple-more-item';
    item.innerHTML=`<span class="simple-more-icon">${iconFrom(original)}</span><span><strong>${displayLabel(label)}</strong><small>${description(label)}</small></span>`;
    item.addEventListener('click',()=>{original.click();setViewClass(label);closeDrawer()});list.appendChild(item);
  });
  overlay.appendChild(drawer);document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeDrawer()});
  drawer.querySelector('.simple-more-close').addEventListener('click',closeDrawer);
}
function openDrawer(){document.getElementById('simpleMoreOverlay')?.classList.add('open')}
function closeDrawer(){document.getElementById('simpleMoreOverlay')?.classList.remove('open')}

function simplifyNavigation(){
  const nav=document.querySelector('nav');if(!nav)return false;
  const buttons=[...nav.querySelectorAll(':scope > button')].filter(button=>!button.classList.contains('simple-more-button'));
  if(!buttons.length)return false;
  const extras=[];
  buttons.forEach(button=>{
    const label=navLabel(button);
    if(isPrimary(label)){
      button.classList.remove('simple-hidden-nav');
      if(label.includes('المصاريف')){
        const icon=button.querySelector('b')?.outerHTML||'';
        button.innerHTML=`${icon}المالية`;
      }
      if(button.dataset.simpleViewBound!=='1'){
        button.dataset.simpleViewBound='1';
        button.addEventListener('click',()=>setTimeout(()=>setViewClass(displayLabel(label)),0));
      }
    }else{button.classList.add('simple-hidden-nav');extras.push(button)}
  });
  let more=nav.querySelector('.simple-more-button');
  if(!more){more=document.createElement('button');more.type='button';more.className='simple-more-button';more.innerHTML='<b>•••</b>المزيد';more.addEventListener('click',openDrawer);nav.appendChild(more)}
  createDrawer(extras);
  const active=buttons.find(button=>button.classList.contains('active'));
  setViewClass(active?displayLabel(navLabel(active)):'الرئيسية');
  return true;
}

function initialize(){
  addStylesheet();document.body.classList.add('simplified-ui');enhanceHeader();
  if(!simplifyNavigation())setTimeout(simplifyNavigation,500);
  setTimeout(()=>{enhanceHeader();simplifyNavigation();compactHome()},1400);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
