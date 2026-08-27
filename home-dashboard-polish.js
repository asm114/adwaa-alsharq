(()=>{
'use strict';
if(window.__adwaaHomeDashboardPolishInstalled)return;
window.__adwaaHomeDashboardPolishInstalled=true;

function isHome(){return document.body.classList.contains('simple-view-home')||document.querySelector('#dashboard.view.active')}
function syncHomeViewClass(){document.body.classList.toggle('simple-view-home',Boolean(document.querySelector('#dashboard.view.active')))}
function norm(value){return String(value||'').replace(/\s+/g,' ').trim()}

function removeLegacyCleaningUi(){
  document.querySelectorAll('nav button[data-view="cleaning"],nav button').forEach(button=>{
    const text=norm(button.textContent);
    if(button.dataset.view==='cleaning'||text.includes('التنظيف')||text.includes('جميل'))button.remove();
  });
  const cleaningView=document.getElementById('cleaning');
  if(cleaningView){cleaningView.hidden=true;cleaningView.classList.remove('active')}
  const roots=[document.getElementById('dashboard'),document.getElementById('simpleHomeDashboard')].filter(Boolean);
  roots.forEach(root=>{
    root.querySelectorAll('.today-action-card,.today-action-label,button,h2,h3,h4,.k,.meta,p').forEach(node=>{
      const text=norm(node.textContent);
      if(!/تنظيف مطلوب|مهمة تنظيف|فتح التنظيف|التنظيف وجميل/.test(text))return;
      const card=node.matches?.('.today-action-card')?node:node.closest('.today-action-card,.action-alert,.stat,.item,.card,.section');
      if(card&&card!==root)card.remove();
    });
  });
  const drawer=document.getElementById('simpleMoreOverlay');
  drawer?.querySelectorAll('.simple-more-item').forEach(item=>{
    const text=norm(item.textContent);if(text.includes('التنظيف')||text.includes('جميل'))item.remove();
  });
}

function removeLocalAssistantFeature(){
  document.getElementById('localAssistantCard')?.remove();
  window.runLocalAssistant=undefined;
  window.parseAssistantDate=undefined;
  window.initRCCandidateUI=function(){
    removeLegacyCleaningUi();
    document.getElementById('localAssistantCard')?.remove();
  };
}

function updatePrivacyButton(){
  const button=document.getElementById('amountPrivacyToggle');if(!button)return;
  const hidden=document.body.classList.contains('amounts-hidden');
  const html=`<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6${hidden?'M4 4l16 16':''}"/></svg><span>${hidden?'إظهار المبالغ':'إخفاء المبالغ'}</span>`;
  const label=hidden?'إظهار المبالغ':'إخفاء المبالغ';
  const display=isHome()?'inline-flex':'none';
  if(button.innerHTML!==html)button.innerHTML=html;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  if(button.title!==label)button.title=label;
  if(button.style.display!==display)button.style.display=display;
}

function removeBookingShortcutsOutsideBookings(){
  const headerAdd=document.getElementById('headerAddBooking');
  if(headerAdd){const display=document.querySelector('#bookings.view.active')?'inline-flex':'none';if(headerAdd.style.display!==display)headerAdd.style.display=display}
}

function compactStatusCard(){
  const card=document.getElementById('resortStatusCard');if(!card)return;
  if(!card.classList.contains('home-status-compact'))card.classList.add('home-status-compact');
}

function apply(){
  syncHomeViewClass();
  removeLocalAssistantFeature();
  removeLegacyCleaningUi();
  updatePrivacyButton();removeBookingShortcutsOutsideBookings();
  if(isHome())compactStatusCard();
}

function addStyles(){
  if(!document.querySelector('link[data-app-experience-pro]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='app-experience-pro.css?v=20260817-2';link.dataset.appExperiencePro='1';document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-home-dashboard-polish]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='home-dashboard-polish.css?v=20260818-1';link.dataset.homeDashboardPolish='1';document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-impeccable-refinement]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='impeccable-refinement.css?v=20260821-1';link.dataset.impeccableRefinement='1';document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-luxe-trial-theme]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='luxe-trial-theme.css?v=20260821-1';link.dataset.luxeTrialTheme='1';document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-luxe-customers-trial]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='luxe-customers-trial.css?v=20260821-1';link.dataset.luxeCustomersTrial='1';document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-customer-directory-v2]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='customer-directory-v2.css?v=20260822-1';link.dataset.customerDirectoryV2='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-customer-directory-v2]')){
    const script=document.createElement('script');script.src='customer-directory-trial.js?v=20260822-1';script.defer=true;script.dataset.customerDirectoryV2='1';document.head.appendChild(script);
  }
  if(!document.querySelector('link[data-home-metric-drilldowns]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='home-metric-drilldowns.css?v=20260822-1';link.dataset.homeMetricDrilldowns='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-home-metric-drilldowns]')){
    const script=document.createElement('script');script.src='home-metric-drilldowns.js?v=20260822-1';script.defer=true;script.dataset.homeMetricDrilldowns='1';document.head.appendChild(script);
  }
  if(!document.querySelector('link[data-luxe-controls]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='luxe-controls.css?v=20260822-1';link.dataset.luxeControls='1';document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-approved-calendar-design]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='calendar-approved-design.css?v=20260826-1';link.dataset.approvedCalendarDesign='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-approved-calendar-design]')){
    const script=document.createElement('script');script.src='calendar-approved-design.js?v=20260826-1';script.defer=true;script.dataset.approvedCalendarDesign='1';document.head.appendChild(script);
  }
}

function initialize(){
  removeLocalAssistantFeature();
  addStyles();
  apply();setTimeout(apply,350);setTimeout(apply,1400);
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}).observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(apply,30),true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();