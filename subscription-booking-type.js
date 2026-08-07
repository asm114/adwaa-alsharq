(()=>{
'use strict';
if(window.__adwaaSubscriptionBookingTypeInstalled)return;
window.__adwaaSubscriptionBookingTypeInstalled=true;

// جسر محدود للملفات الإضافية لأن db وcurrentUser معرفان بنطاق global lexical.
try{
  Object.defineProperty(window,'db',{configurable:true,get:()=>db,set:value=>{db=value}});
  Object.defineProperty(window,'currentUser',{configurable:true,get:()=>currentUser});
}catch(error){console.warn('تعذر تهيئة جسر بيانات الاشتراكات',error)}
if(typeof persist==='function')window.persist=persist;
if(typeof renderAll==='function')window.renderAll=renderAll;
if(typeof renderCustomers==='function')window.renderCustomers=renderCustomers;
if(typeof normalizeBookingCommission==='function')window.normalizeBookingCommission=normalizeBookingCommission;
if(typeof loadPortalUnavailablePeriods==='function')window.loadPortalUnavailablePeriods=loadPortalUnavailablePeriods;

function addSubscriptionOption(){
  const type=document.getElementById('bType');
  if(!type)return false;
  if(![...type.options].some(option=>option.value==='اشتراك دوري')){
    const option=document.createElement('option');option.value='اشتراك دوري';option.textContent='اشتراك دوري';type.appendChild(option);
  }
  if(type.dataset.subscriptionBookingBound==='1')return true;
  type.dataset.subscriptionBookingBound='1';type.addEventListener('change',handleBookingTypeChange);return true;
}
function handleBookingTypeChange(event){
  if(event.target.value!=='اشتراك دوري')return;
  const name=String(document.getElementById('bName')?.value||'').trim(),phone=String(document.getElementById('bPhone')?.value||'').trim();
  if(!name||!phone){event.target.value='يومي';alert('اكتب اسم العميل ورقم الجوال أولًا، ثم اختر اشتراك دوري.');document.getElementById(!name?'bName':'bPhone')?.focus();return}
  launchSubscriptionFromBooking(name,phone);
}
function launchSubscriptionFromBooking(name,phone){
  if(typeof window.openSubscriptionModal!=='function'){alert('تعذر فتح الاشتراك الآن. حدّث الصفحة وحاول مرة أخرى.');document.getElementById('bType').value='يومي';return}
  const total=Number(document.getElementById('bTotal')?.value||0),paid=Number(document.getElementById('bPaid')?.value||0),notes=String(document.getElementById('bNotes')?.value||'').trim();
  window.openSubscriptionModal();
  setTimeout(()=>{
    const customer=document.getElementById('subCustomer');if(!customer)return;
    let option=[...customer.options].find(item=>item.dataset.phone===phone);
    if(!option){option=document.createElement('option');option.value=`new:${phone}`;option.dataset.name=name;option.dataset.phone=phone;option.textContent=`${name} — ${phone} (عميل جديد)`;customer.prepend(option)}
    customer.value=option.value;option.selected=true;
    if(document.getElementById('subTotal')&&total>0)subTotal.value=String(total);
    if(document.getElementById('subPaid')&&paid>0)subPaid.value=String(Math.min(total||paid,paid));
    if(document.getElementById('subNote')&&notes)subNote.value=notes;
    customer.dispatchEvent(new Event('input',{bubbles:true}));
  },0);
  document.getElementById('bookingModal')?.classList.remove('open');document.getElementById('bType').value='يومي';
}
function wrapOpenBooking(){
  if(typeof window.openBooking!=='function'||window.openBooking.__subscriptionTypeWrapped)return;
  const original=window.openBooking;const wrapped=function(...args){const result=original.apply(this,args);setTimeout(addSubscriptionOption,0);return result};wrapped.__subscriptionTypeWrapped=true;window.openBooking=wrapped;
}
function initialize(){addSubscriptionOption();wrapOpenBooking();setTimeout(()=>{addSubscriptionOption();wrapOpenBooking()},600)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();

(()=>{const script=document.createElement('script');script.src='subscription-draft-workflow.js';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='subscription-official-click-fix.js?v=20260807-1';script.defer=true;script.onerror=()=>console.warn('تعذر تحميل إصلاح اعتماد الاشتراك');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='subscription-calendar-booking-labels.js?v=20260807-1';script.defer=true;script.onerror=()=>console.warn('تعذر تحميل تسميات تقويم الاشتراك');document.head.appendChild(script)})();
// واجهة أضواء الشرق المبسطة — المرحلة الأولى.
(()=>{const script=document.createElement('script');script.src='simplified-ui.js';script.defer=true;document.head.appendChild(script)})();
