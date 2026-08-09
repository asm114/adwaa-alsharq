(()=>{
'use strict';
if(window.__adwaaExpenseMobileStabilityInstalled)return;
window.__adwaaExpenseMobileStabilityInstalled=true;

let viewportBound=false;
let modalObserver=null;

function modal(){return document.getElementById('expenseModal')}
function sheet(){return modal()?.querySelector('.sheet')||null}
function updateViewportHeight(){
  const height=Math.max(320,Math.round(window.visualViewport?.height||window.innerHeight||0));
  document.documentElement.style.setProperty('--expense-viewport-height',`${height}px`);
}
function bindViewport(){
  if(viewportBound)return;
  viewportBound=true;
  updateViewportHeight();
  window.visualViewport?.addEventListener('resize',updateViewportHeight,{passive:true});
  window.visualViewport?.addEventListener('scroll',updateViewportHeight,{passive:true});
  window.addEventListener('orientationchange',updateViewportHeight,{passive:true});
}
function unbindViewport(){
  if(!viewportBound)return;
  viewportBound=false;
  window.visualViewport?.removeEventListener('resize',updateViewportHeight);
  window.visualViewport?.removeEventListener('scroll',updateViewportHeight);
  window.removeEventListener('orientationchange',updateViewportHeight);
  document.documentElement.style.removeProperty('--expense-viewport-height');
}
function activate(){
  const el=modal();if(!el)return;
  document.body.classList.add('expense-modal-active');
  bindViewport();
  requestAnimationFrame(()=>{sheet()?.scrollTo({top:0,left:0,behavior:'auto'})});
}
function deactivate(){
  document.body.classList.remove('expense-modal-active');
  unbindViewport();
}
function keepFocusedFieldVisible(event){
  const el=modal();
  if(!el?.classList.contains('open')||!el.contains(event.target))return;
  if(!event.target.matches('input,select,textarea'))return;
  setTimeout(()=>{
    const scroller=sheet();if(!scroller)return;
    const fieldRect=event.target.getBoundingClientRect(),sheetRect=scroller.getBoundingClientRect();
    if(fieldRect.bottom>sheetRect.bottom-18)scroller.scrollTop+=fieldRect.bottom-(sheetRect.bottom-18);
    else if(fieldRect.top<sheetRect.top+62)scroller.scrollTop-=sheetRect.top+62-fieldRect.top;
  },180);
}
function initialize(){
  const el=modal();if(!el)return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='expense-mobile-stability.css?v=20260809-1';link.dataset.expenseMobileStability='1';document.head.appendChild(link);
  document.getElementById('eAmount')?.setAttribute('inputmode','decimal');
  el.addEventListener('focusin',keepFocusedFieldVisible);
  modalObserver=new MutationObserver(()=>el.classList.contains('open')?activate():deactivate());
  modalObserver.observe(el,{attributes:true,attributeFilter:['class']});
  if(el.classList.contains('open'))activate();
  window.addEventListener('pagehide',deactivate,{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
