/* Presentation layer. Financial figures and actions retain their existing source. */
(()=>{
'use strict';
if(window.__adwaaWorkspaceInstalled)return;
window.__adwaaWorkspaceInstalled=true;
const icons={dashboard:'M3 10l9-7 9 7v10H3z M9 20v-7h6v7',bookings:'M5 4h14v17H5z M8 2v4m8-4v4 M8 10h8m-8 4h8',customers:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7m1 4a4 4 0 0 1 4 4v2',calendarView:'M4 5h16v16H4z M8 2v6m8-6v6 M4 10h16 M8 14h2m4 0h2m-8 3h2',expenses:'M3 6h18v14H3z M3 10h18 M15 15h3',dataProtection:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',customerPortalAdmin:'M3 4h18v16H3z M3 9h18 M8 9v11',about:'M12 8v1m0 3v5 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2'};
let financeView='overview';
const groups=[['overview','نظرة عامة'],['movements','حساب المنتجع'],['expenses','المصروفات'],['maintenance','الصيانة والدفعات'],['advances','السلف'],['salaries','الرواتب'],['commissions','العمولات'],['reports','التقارير'],['all','عرض الكل']];
function navigation(){
 const nav=document.querySelector('#appRoot>nav');if(!nav)return;
 nav.setAttribute('aria-label','أقسام النظام');
 if(!nav.querySelector('.workspace-brand')){const brand=document.createElement('div');brand.className='workspace-brand';brand.innerHTML='<span class="workspace-mark">أ</span><div><strong>أضواء الشرق</strong><small>إدارة المنتجع</small></div>';nav.prepend(brand)}
 nav.querySelectorAll(':scope>button').forEach(button=>{const key=button.dataset.view,icon=button.querySelector('b');if(icon&&icons[key]&&icon.dataset.workspaceIcon!==key){icon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons[key]+'"/></svg>';icon.dataset.workspaceIcon=key}});
}
function finance(){
 const root=document.getElementById('expenses');if(!root)return;
 root.dataset.workspaceFinanceView=financeView;
 if(!document.getElementById('workspaceFinanceNav')){
  const nav=document.createElement('div');nav.id='workspaceFinanceNav';nav.className='workspace-finance-nav';nav.setAttribute('role','group');nav.setAttribute('aria-label','أقسام المالية');
  groups.forEach(([key,label])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.financeView=key;button.addEventListener('click',()=>{financeView=key;finance()});nav.append(button)});root.prepend(nav);
 }
 root.querySelectorAll(':scope>.section').forEach(section=>{
  const ids={financeEntryHub:'overview',resortAccountSection:'movements',maintenanceInstallmentsSection:'maintenance',workerSalariesSection:'salaries',accountingNotesSection:'advances'};
  const group=ids[section.id]||(section.querySelector('#expenseTableBody')?'expenses':section.querySelector('#commissionList')?'commissions':section.querySelector('#financeChart')?'reports':'');
  if(group){section.dataset.financeGroup=group;section.classList.toggle('workspace-panel-hidden',financeView!=='all'&&group!==financeView&&!(financeView==='overview'&&group==='movements'))}
 });
 root.querySelectorAll('[data-finance-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.financeView===financeView)));
 const summary=root.querySelector('.finance-summary');
 if(summary){
  summary.querySelectorAll('.finance-card').forEach(card=>card.classList.toggle('workspace-secondary-metric',!card.querySelector('#finAvailableBalance,#finCashCollected,#finExpenses,#finDue,#finCommissionOutstanding')));
  if(!document.getElementById('workspaceMetricToggle')){const b=document.createElement('button');b.type='button';b.id='workspaceMetricToggle';b.className='workspace-disclosure';b.textContent='عرض بقية المؤشرات المالية';b.setAttribute('aria-expanded','false');b.addEventListener('click',()=>{const open=root.classList.toggle('workspace-expanded-metrics');b.setAttribute('aria-expanded',String(open));b.textContent=open?'اختصار المؤشرات المالية':'عرض بقية المؤشرات المالية'});root.insertBefore(b,summary.nextSibling)}
 }
 const account=document.getElementById('resortAccountSection');
 if(account&&!document.getElementById('workspaceAllMovements')){const b=document.createElement('button');b.id='workspaceAllMovements';b.type='button';b.className='workspace-disclosure';b.textContent='عرض سجل الحركات وتفاصيل الرصيد';b.addEventListener('click',()=>{financeView='movements';finance()});account.append(b)}
 const grid=root.querySelector(':scope>.grid');if(grid)grid.classList.toggle('workspace-panel-hidden',!['reports','all'].includes(financeView));
 if(!document.getElementById('workspaceFinanceScope')){const note=document.createElement('p');note.id='workspaceFinanceScope';note.className='workspace-scope';note.textContent='الرصيد المتاح يشمل جميع الحركات منذ آخر ضبط. مؤشرات الدخل والمصروفات تتبع الفترة المحددة. يمكنك تتبع مصادر الرصيد في حساب المنتجع.';root.prepend(note)}
}
function dialogs(){
 const origins=new WeakMap();
 function prepare(modal){
  if(modal.dataset.workspaceDialog)return;
  modal.dataset.workspaceDialog='1';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  const heading=modal.querySelector('h2,h3');if(heading){if(!heading.id)heading.id='workspace-dialog-'+document.querySelectorAll('[data-workspace-dialog]').length;modal.setAttribute('aria-labelledby',heading.id)}
  modal.querySelectorAll('button.close,button[data-close]').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','إغلاق النافذة')});
  let open=modal.classList.contains('open');
  new MutationObserver(()=>{const next=modal.classList.contains('open');if(next===open)return;open=next;if(next){origins.set(modal,document.activeElement);modal.querySelector('input:not([type=hidden]),select,textarea,button')?.focus({preventScroll:true})}else{const origin=origins.get(modal);if(origin?.isConnected&&origin.getClientRects().length)origin.focus({preventScroll:true})}}).observe(modal,{attributes:true,attributeFilter:['class']});
 }
 document.querySelectorAll('.modal').forEach(prepare);
 new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches('.modal'))prepare(n);n.querySelectorAll('.modal').forEach(prepare)}}).observe(document.body,{childList:true});
 document.addEventListener('keydown',event=>{
  const modal=[...document.querySelectorAll('.modal.open,#simpleMoreOverlay.open')].at(-1);if(!modal)return;
  if(event.key==='Tab'){const items=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&!el.closest('[inert]'));if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  if(event.key==='Escape'&&!modal.querySelector('[aria-busy="true"]')){const close=modal.querySelector('button.close,button[data-close],.simple-more-close');if(close){event.preventDefault();close.click()}}
 });
}
function initialize(){
 document.body.classList.add('admin-workspace');
 const css=document.createElement('link');css.rel='stylesheet';css.href='admin-workspace.css?v=20260927-1';document.head.append(css);
 navigation();finance();dialogs();
 const nav=document.querySelector('#appRoot>nav');if(nav)new MutationObserver(navigation).observe(nav,{childList:true});
 const root=document.getElementById('expenses');if(root)new MutationObserver(finance).observe(root,{childList:true});
 const main=document.querySelector('#appRoot>main');if(main){main.id=main.id||'workspaceMain';main.tabIndex=-1;const skip=document.createElement('a');skip.className='workspace-skip';skip.href='#'+main.id;skip.textContent='تجاوز القائمة إلى المحتوى';document.getElementById('appRoot').prepend(skip)}
 for(const id of ['search','customerSearch']){const el=document.getElementById(id);if(el)el.setAttribute('aria-label',el.placeholder)}
 setTimeout(()=>{navigation();finance()},1600);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
