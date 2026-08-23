(()=>{
'use strict';
if(window.__adwaaBrowserControlsInstalled)return;
window.__adwaaBrowserControlsInstalled=true;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const state={stack:[],lastView:null,navigatingBack:false};

function activeView(){return document.querySelector('.view.active')?.id||''}
function syncButtonVisibility(){
  const hide=activeView()==='dashboard';
  ['appBackBtn','appRefreshBtn'].forEach(id=>{const button=document.getElementById(id);if(button){button.hidden=hide;button.inert=hide}});
}
function closeTopLayer(){
  const drill=document.getElementById('dashboardDrilldown');
  if(drill?.classList.contains('open')){drill.classList.remove('open');return true}
  const open=[...document.querySelectorAll('.modal.open,.sheet.open,[role="dialog"].open')].filter(el=>el.offsetParent!==null);
  const top=open.at(-1);
  if(top){
    const closeBtn=top.querySelector('.close,[aria-label*="إغلاق"],[data-close]');
    if(closeBtn){closeBtn.click();return true}
    top.classList.remove('open');return true;
  }
  return false;
}
function navButtonForView(id){
  if(!id)return null;
  const nav=document.querySelector('nav');if(!nav)return null;
  return [...nav.querySelectorAll('button')].find(btn=>{
    const oc=btn.getAttribute('onclick')||'';
    return btn.dataset.view===id||btn.getAttribute('aria-controls')===id||oc.includes(`'${id}'`)||oc.includes(`\"${id}\"`);
  })||null;
}
function goView(id){
  const btn=navButtonForView(id);
  if(btn){state.navigatingBack=true;btn.click();setTimeout(()=>state.navigatingBack=false,120);return true}
  const view=document.getElementById(id);
  if(view?.classList.contains('view')){
    document.querySelectorAll('.view.active').forEach(v=>v.classList.remove('active'));view.classList.add('active');return true;
  }
  return false;
}
function smartBack(){
  if(closeTopLayer())return;
  while(state.stack.length){const prev=state.stack.pop();if(prev&&prev!==activeView()&&goView(prev))return}
  const homeBtn=[...document.querySelectorAll('nav button')].find(b=>norm(b.textContent).includes('الرئيسية'));
  if(homeBtn&&!norm(homeBtn.textContent).includes(norm(document.querySelector('nav button.active')?.textContent))){homeBtn.click();return}
  if(history.length>1)history.back();
}
function refreshPage(){
  const btn=document.getElementById('appRefreshBtn');if(btn){btn.classList.add('working');btn.disabled=true}
  setTimeout(()=>location.reload(),80);
}
function watchNavigation(){
  state.lastView=activeView();
  const observer=new MutationObserver(()=>{
    const current=activeView();if(!current||current===state.lastView)return;
    if(!state.navigatingBack&&state.lastView)state.stack.push(state.lastView);
    state.lastView=current;
    syncButtonVisibility();
  });
  document.querySelectorAll('.view').forEach(v=>observer.observe(v,{attributes:true,attributeFilter:['class']}));
}
function installButtons(){
  const actions=document.querySelector('.header-actions');if(!actions||document.getElementById('appRefreshBtn'))return false;
  const back=document.createElement('button');back.id='appBackBtn';back.type='button';back.className='privacy-btn app-browser-btn';back.innerHTML='←';back.title='رجوع';back.setAttribute('aria-label','رجوع للشاشة السابقة');back.addEventListener('click',smartBack);
  const refresh=document.createElement('button');refresh.id='appRefreshBtn';refresh.type='button';refresh.className='privacy-btn app-browser-btn';refresh.innerHTML='↻';refresh.title='تحديث الصفحة';refresh.setAttribute('aria-label','تحديث الصفحة');refresh.addEventListener('click',refreshPage);
  const plus=actions.querySelector('.icon-btn');
  if(plus?.nextSibling){actions.insertBefore(refresh,plus.nextSibling);actions.insertBefore(back,refresh.nextSibling)}else{actions.prepend(back);actions.prepend(refresh)}
  syncButtonVisibility();
  return true;
}
function addStyles(){if(document.getElementById('browserControlsStyle'))return;const s=document.createElement('style');s.id='browserControlsStyle';s.textContent=`
.app-browser-btn{display:inline-flex;align-items:center;justify-content:center;font-size:25px;font-weight:900;line-height:1;color:#0f5b4c!important;border-color:#d7e3df!important;background:#fff!important}.app-browser-btn[hidden]{display:none!important}.app-browser-btn:active{transform:scale(.96)}#appRefreshBtn.working{opacity:.55;animation:adwaaSpin .65s linear infinite}@keyframes adwaaSpin{to{transform:rotate(360deg)}}@media(max-width:620px){.header-actions{gap:7px!important}.app-browser-btn{width:48px!important;height:48px!important;font-size:23px!important}}
`;document.head.appendChild(s)}
function init(){addStyles();if(!installButtons()){const mo=new MutationObserver(()=>{if(installButtons())mo.disconnect()});mo.observe(document.documentElement,{childList:true,subtree:true})}watchNavigation()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

(()=>{
  if(window.__adwaaCalendarAwarenessLoaderInstalled)return;
  window.__adwaaCalendarAwarenessLoaderInstalled=true;
  const script=document.createElement('script');
  script.src='calendar-awareness.js?v=20260823-1';
  script.defer=true;
  script.onerror=()=>console.warn('تعذر تحميل تنبيهات المناسبات والإجازات');
  document.head.appendChild(script);
})();
