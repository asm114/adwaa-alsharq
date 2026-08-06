(()=>{
'use strict';
if(window.__adwaaSimplifiedUiInstalled)return;
window.__adwaaSimplifiedUiInstalled=true;
const SIMPLE_UI_BUILD='20260806.2';

const PRIMARY_LABELS=['الرئيسية','الحجوزات','التقويم','العملاء','المالية'];
const DESCRIPTIONS={
  'بوابة العملاء':'إدارة الصور والأسعار والمحتوى',
  'الإعدادات':'إعدادات النظام والنسخ والحماية',
  'المصروفات':'إدارة المصروفات والتصنيفات',
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

function addStylesheet(){
  if(document.querySelector('link[data-simplified-ui]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=`simplified-ui.css?v=${SIMPLE_UI_BUILD}`;link.dataset.simplifiedUi='1';document.head.appendChild(link);
}

function enhanceHeader(){
  const header=document.querySelector('header');if(!header)return;
  const subtitle=header.querySelector('.subtitle');
  if(subtitle&&!document.getElementById('simpleHeaderChip')){
    const chip=document.createElement('span');chip.id='simpleHeaderChip';chip.className='simple-ui-chip';chip.textContent='واجهة مبسطة';subtitle.insertAdjacentElement('afterend',chip);
  }
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
    item.innerHTML=`<span class="simple-more-icon">${iconFrom(original)}</span><span><strong>${label}</strong><small>${description(label)}</small></span>`;
    item.addEventListener('click',()=>{original.click();closeDrawer()});list.appendChild(item);
  });
  overlay.appendChild(drawer);document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeDrawer()});
  drawer.querySelector('.simple-more-close').addEventListener('click',closeDrawer);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDrawer()});
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
    if(isPrimary(label))button.classList.remove('simple-hidden-nav');
    else{button.classList.add('simple-hidden-nav');extras.push(button)}
  });
  let more=nav.querySelector('.simple-more-button');
  if(!more){more=document.createElement('button');more.type='button';more.className='simple-more-button';more.innerHTML='<b>•••</b>المزيد';more.addEventListener('click',openDrawer);nav.appendChild(more)}
  createDrawer(extras);
  return true;
}

function initialize(){
  addStylesheet();document.body.classList.add('simplified-ui');enhanceHeader();
  if(!simplifyNavigation())setTimeout(simplifyNavigation,500);
  setTimeout(()=>{enhanceHeader();simplifyNavigation()},1400);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
