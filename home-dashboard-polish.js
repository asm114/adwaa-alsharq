(()=>{
'use strict';
if(window.__adwaaHomeDashboardPolishInstalled)return;
window.__adwaaHomeDashboardPolishInstalled=true;

const PRIMARY_IDS=['sTotal','sToday','sWeek','sMonth','sUpcoming','sRevenueToday','sRevenueMonth','sPending'];
const SECONDARY_IDS=['sCommission','sPaid','sDue','sFullyPaid'];
const norm=value=>String(value||'').replace(/\s+/g,' ').trim();

function isHome(){return document.body.classList.contains('simple-view-home')||document.querySelector('#dashboard.view.active')}
function statById(id){return document.getElementById(id)?.closest('.stat')||null}

function updatePrivacyButton(){
  const button=document.getElementById('amountPrivacyToggle');if(!button)return;
  const hidden=document.body.classList.contains('amounts-hidden');
  const html=hidden?'👁️‍🗨️ <span>إظهار المبالغ</span>':'👁️ <span>إخفاء المبالغ</span>';
  const label=hidden?'إظهار المبالغ':'إخفاء المبالغ';
  const display=isHome()?'inline-flex':'none';
  if(button.innerHTML!==html)button.innerHTML=html;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  if(button.title!==label)button.title=label;
  if(button.style.display!==display)button.style.display=display;
}

function removeBookingShortcutsOutsideBookings(){
  const dashboard=document.getElementById('dashboard');
  if(dashboard){
    dashboard.querySelectorAll('button').forEach(button=>{
      const text=norm(button.textContent);
      if(/إضافة حجز|حجز جديد/.test(text)&&button.style.display!=='none')button.style.display='none';
    });
  }
  const headerAdd=[...document.querySelectorAll('header .icon-btn')].find(btn=>btn.id!=='amountPrivacyToggle');
  if(headerAdd){const display=document.querySelector('#bookings.view.active')?'inline-flex':'none';if(headerAdd.style.display!==display)headerAdd.style.display=display}
}

function arrangeStats(){
  const dashboard=document.getElementById('simpleHomeDashboard');if(!dashboard||!isHome())return;
  const primary=dashboard.querySelector('.simple-home-stats');if(!primary)return;
  PRIMARY_IDS.forEach(id=>{const stat=statById(id);if(stat&&stat.parentElement!==primary)primary.appendChild(stat)});

  let details=dashboard.querySelector('.home-secondary-details');
  if(!details){
    details=document.createElement('details');details.className='home-secondary-details';
    details.innerHTML='<summary>تفاصيل إضافية</summary><div class="home-secondary-stats"></div>';
    dashboard.appendChild(details);
  }
  const secondary=details.querySelector('.home-secondary-stats');
  SECONDARY_IDS.forEach(id=>{const stat=statById(id);if(stat&&stat.parentElement!==secondary)secondary.appendChild(stat)});
  const oldGrid=document.querySelector('#dashboard > .grid');if(oldGrid&&!oldGrid.children.length&&oldGrid.style.display!=='none')oldGrid.style.display='none';
}

function compactStatusCard(){
  const card=document.getElementById('resortStatusCard');if(!card)return;
  if(!card.classList.contains('home-status-compact'))card.classList.add('home-status-compact');
}

function apply(){
  updatePrivacyButton();removeBookingShortcutsOutsideBookings();
  if(isHome()){arrangeStats();compactStatusCard()}
}

function initialize(){
  if(!document.querySelector('link[data-home-dashboard-polish]')){const link=document.createElement('link');link.rel='stylesheet';link.href='home-dashboard-polish.css?v=20260808-1';link.dataset.homeDashboardPolish='1';document.head.appendChild(link)}
  apply();setTimeout(apply,350);setTimeout(apply,1400);
  new MutationObserver(()=>setTimeout(apply,0)).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',()=>setTimeout(apply,30),true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
