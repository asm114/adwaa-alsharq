/* Presentation only. Original fields, submit handlers and data sources are retained. */
(()=>{
'use strict';
if(window.__adwaaNativeResortUI)return;
window.__adwaaNativeResortUI=true;
const icon=path=>`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}"/></svg>`;
const icons={plus:'M12 5v14M5 12h14',arrow:'M14 6l-6 6 6 6',check:'M5 12l4 4L19 6',spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z'};
let frame=0,step=0,wasOpen=false;
const viewIntroductions={bookings:['الضيافة تبدأ من هنا','حجوزاتك، بوضوح.','ابحث عن الضيف، وراجع الإقامة والمدفوعات من بطاقة واحدة.'],customers:['علاقات تدوم','كل ضيف، له مكان.','سجل موحد للحجوزات والمدفوعات والملاحظات.'],expenses:['الصورة المالية','أرقام واضحة. قرارات أسهل.','تابع الحركات والمصروفات والسلف من أقسام مستقلة.'],settings:['مساحتك، على طريقتك','إدارة مرتبة.','الحساب والاتصال، حماية البيانات، وبوابة العملاء في مكان واحد.']};
function workspace(){
 for(const [id,copy] of Object.entries(viewIntroductions)){
  const view=query(id);if(!view||view.querySelector('.native-view-intro'))continue;
  const intro=document.createElement('div');intro.className='native-view-intro';
  const eyebrow=document.createElement('span');eyebrow.className='native-eyebrow';eyebrow.textContent=copy[0];
  const heading=document.createElement('h2');heading.textContent=copy[1];
  const detail=document.createElement('p');detail.textContent=copy[2];intro.append(eyebrow,heading,detail);view.prepend(intro);
 }
 const grid=query('settings')?.querySelector('.section>div[style]');
 if(grid&&!grid.classList.contains('native-settings-destinations'))grid.classList.add('native-settings-destinations');
}

const labels=['التفاصيل','الدفع','الطلبات والمرفقات','المستندات'];
const groups=[['booking-customer-section','booking-stay-section'],['booking-payment-section'],['booking-notes-section','booking-special-request-section'],['booking-send-section']];
const query=id=>document.getElementById(id);
function route(id){const button=document.querySelector(`#appRoot>nav>button[data-view="${id}"]`);if(button)button.click();else window.switchView?.(id)}
function home(){
 const root=query('homeCommandCenter');if(!root||query('nativeHomeIntro'))return;
 const intro=document.createElement('section');intro.id='nativeHomeIntro';intro.className='native-home-intro';
 intro.innerHTML=`<div><span class="native-eyebrow">مساحة إدارة المنتجع</span><h2>كل شيء، في مكانه.</h2><p>نظرة واضحة على يومك، ومساحة لكل التفاصيل.</p></div><button type="button" class="native-add-booking">${icon(icons.plus)}<span>حجز جديد</span></button>`;
 intro.querySelector('button').addEventListener('click',()=>window.openBooking?.());root.prepend(intro);
 const status=query('resortStatusCard');if(status&&!status.querySelector('.native-status-art')){const art=document.createElement('span');art.className='native-status-art';art.setAttribute('aria-hidden','true');art.innerHTML='<svg viewBox="0 0 150 120" fill="none"><path d="M20 100h110M35 100V57l40-30 40 30v43M50 100V70h50v30M64 100V80h22v20M75 27V8m0 10-13-5m13 5 13-5M15 72V48m0 9-9-6m9 6 9-6M133 83V52m0 12-10-7m10 7 10-7"/></svg>';status.append(art)}
 const quick=root.querySelector('.home-quick-actions h2');if(quick)quick.textContent='ابدأ من هنا';
 const next=root.querySelector('.home-next-booking h2');if(next)next.textContent='على موعد مع ضيوفك';
}
function navigation(){
 const nav=document.querySelector('#appRoot>nav');if(!nav)return;
 if(!nav.classList.contains('native-navigation'))nav.classList.add('native-navigation');
 if(!nav.querySelector('.native-nav-caption')){const caption=document.createElement('span');caption.className='native-nav-caption';caption.textContent='مساحة العمل';nav.querySelector('.workspace-brand')?.after(caption)}
 if(!nav.querySelector('.native-nav-footer')){const footer=document.createElement('div');footer.className='native-nav-footer';footer.innerHTML='<span class="native-brand-sun">✳</span><div><strong>أضواء الشرق</strong><small>لكل إقامة حكاية</small></div>';nav.append(footer)}
 nav.querySelectorAll(':scope>button').forEach(button=>{if(button.dataset.view==='settings')button.dataset.nativeMore='true'});
}
function sectionStep(section){return groups.findIndex(names=>names.some(name=>section.classList.contains(name)))}
function showStep(next,focus=false){
 const modal=query('bookingModal'),form=query('bookingForm');if(!modal||!form)return;
 step=Math.max(0,Math.min(3,next));modal.dataset.nativeStep=String(step);
 form.querySelectorAll(':scope>.booking-form-section').forEach(section=>{const index=sectionStep(section);section.classList.toggle('native-section-away',index!==-1&&index!==step)});
 modal.querySelectorAll('[data-native-step]').forEach(button=>{const selected=Number(button.dataset.nativeStep)===step;button.setAttribute('aria-current',selected?'step':'false');button.classList.toggle('native-step-done',Number(button.dataset.nativeStep)<step)});
 const previous=query('nativeBookingPrevious'),nextButton=query('nativeBookingNext');if(previous)previous.hidden=step===0;if(nextButton){nextButton.hidden=step===3;nextButton.innerHTML=`<span>التالي</span>${icon(icons.arrow)}`}
 const scroll=modal.querySelector('.booking-modal-scroll');if(scroll)scroll.scrollTop=0;
 if(focus)form.querySelector('.booking-form-section:not(.native-section-away) input:not([type=hidden]):not([readonly]),.booking-form-section:not(.native-section-away) select')?.focus({preventScroll:true});
 summary();
}
function summary(){
 const rail=query('nativeBookingSummary');if(!rail)return;
 const value=id=>query(id)?.value||'';
 rail.querySelector('[data-summary-name]').textContent=value('bName')||'ضيفك القادم';
 rail.querySelector('[data-summary-date]').textContent=value('bDate')||'اختر تاريخ الإقامة';
 rail.querySelector('[data-summary-type]').textContent=value('bType')||'يومي';
 rail.querySelector('[data-summary-total]').textContent=typeof window.money==='function'?window.money(value('bTotal')):value('bTotal');
}
function booking(){
 const modal=query('bookingModal'),form=query('bookingForm');if(!modal||!form)return;
 if(!query('nativeBookingSteps')){
  const steps=document.createElement('div');steps.id='nativeBookingSteps';steps.setAttribute('role','navigation');steps.setAttribute('aria-label','خطوات الحجز');
  labels.forEach((label,index)=>{const button=document.createElement('button');button.type='button';button.dataset.nativeStep=String(index);button.innerHTML=`<span class="native-step-number">${index+1}</span><span>${label}</span>`;button.addEventListener('click',()=>showStep(index,true));steps.append(button)});
  modal.querySelector('.sheet-head').after(steps);
  const rail=document.createElement('aside');rail.id='nativeBookingSummary';rail.innerHTML=`<div class="native-summary-heading">${icon(icons.spark)}<span>تفاصيل إقامتك</span></div><h3 data-summary-name>ضيفك القادم</h3><div class="native-summary-line"><span>موعد الإقامة</span><strong data-summary-date>اختر التاريخ</strong></div><div class="native-summary-line"><span>نوع الحجز</span><strong data-summary-type>يومي</strong></div><div class="native-summary-price"><span>قيمة الحجز</span><strong data-summary-total>0</strong></div><p>راجع بيانات الضيف والإقامة قبل حفظ الحجز.</p>`;
  modal.querySelector('.booking-modal-scroll').after(rail);
  const footer=modal.querySelector('.booking-modal-actions'),prev=document.createElement('button'),next=document.createElement('button');prev.type=next.type='button';prev.id='nativeBookingPrevious';prev.className='secondary';prev.textContent='السابق';next.id='nativeBookingNext';next.className='secondary';prev.addEventListener('click',()=>showStep(step-1,true));next.addEventListener('click',()=>showStep(step+1,true));footer.prepend(prev);footer.append(next);
  form.addEventListener('input',summary);form.addEventListener('change',summary);
  // Browser validation must reveal required fields on a different step before focusing them.
  form.addEventListener('invalid',event=>{const section=event.target.closest('.booking-form-section');if(section){const index=sectionStep(section);if(index>=0&&index!==step)showStep(index)}},true);
  showStep(0);
 }
 form.querySelectorAll(':scope>.booking-form-section').forEach(section=>{const index=sectionStep(section),away=index!==-1&&index!==step;if(section.classList.contains('native-section-away')!==away)section.classList.toggle('native-section-away',away)});
 const open=modal.classList.contains('open');if(open&&!wasOpen)showStep(0);wasOpen=open;
}
function apply(){
 const active=document.querySelector('#appRoot main>.view.active');
 // Keep the approved calendar's viewport, controls and internal styles untouched.
 document.body.classList.toggle('native-resort-active',active?.id!=='calendarView');
 if(!document.body.classList.contains('native-resort-shell'))document.body.classList.add('native-resort-shell');
 home();navigation();booking();workspace();
}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;apply()})}
function init(){
 const css=document.createElement('link');css.rel='stylesheet';css.href='native-resort-ui.css?v=20261102-native-1';document.head.append(css);
 apply();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 window.addEventListener('adwaa-subscription-updated',schedule);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
