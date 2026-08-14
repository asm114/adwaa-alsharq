(()=>{
'use strict';
if(window.__adwaaSubscriptionBookingTypeInstalled)return;
window.__adwaaSubscriptionBookingTypeInstalled=true;

try{
  Object.defineProperty(window,'db',{configurable:true,get:()=>db,set:value=>{db=value}});
  Object.defineProperty(window,'currentUser',{configurable:true,get:()=>currentUser});
}catch(error){console.warn('تعذر تهيئة جسر بيانات الاشتراكات',error)}
if(typeof persist==='function')window.persist=persist;
if(typeof renderAll==='function')window.renderAll=renderAll;
if(typeof renderCustomers==='function')window.renderCustomers=renderCustomers;
if(typeof normalizeBookingCommission==='function')window.normalizeBookingCommission=normalizeBookingCommission;
if(typeof loadPortalUnavailablePeriods==='function')window.loadPortalUnavailablePeriods=loadPortalUnavailablePeriods;

try{
  if(typeof normalizeDB==='function'&&!normalizeDB.__subscriptionStatePreserved){
    const baseNormalizeDB=normalizeDB;
    const wrappedNormalizeDB=function(value){
      const source=value&&typeof value==='object'?value:{};
      const normalized=baseNormalizeDB(source);
      normalized.subscriptions=Array.isArray(source.subscriptions)?source.subscriptions:[];
      normalized.subscriptionDrafts=Array.isArray(source.subscriptionDrafts)?source.subscriptionDrafts:[];
      return normalized;
    };
    wrappedNormalizeDB.__subscriptionStatePreserved=true;
    wrappedNormalizeDB.__baseNormalizeDB=baseNormalizeDB;
    normalizeDB=wrappedNormalizeDB;
    window.normalizeDB=wrappedNormalizeDB;
  }
}catch(error){console.warn('تعذر تفعيل حفظ حالة الاشتراكات',error)}

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

(()=>{const script=document.createElement('script');script.async=false;script.src='portal-admin-client.js?v=20260814-1';script.onerror=()=>console.warn('تعذر تحميل جلسة إدارة بوابة العملاء');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-draft-workflow.js';document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-editing.js?v=20260807-2';script.onerror=()=>console.warn('تعذر تحميل تعديل الاشتراكات');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-edit-button-fallback.js?v=20260807-1';script.onerror=()=>console.warn('تعذر تحميل زر تعديل الاشتراكات');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-official-click-fix.js?v=20260807-1';script.onerror=()=>console.warn('تعذر تحميل إصلاح اعتماد الاشتراك');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-calendar-booking-labels.js?v=20260807-1';script.onerror=()=>console.warn('تعذر تحميل تسميات تقويم الاشتراك');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-customer-finance.js?v=20260813-1';script.onerror=()=>console.warn('تعذر تحميل ربط مالية الاشتراك بالعميل');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-flexible-enhancements.js?v=20260813-1';script.onerror=()=>console.warn('تعذر تحميل تحسينات الاشتراكات المرنة');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-control-center.js?v=20260808-3';script.onerror=()=>console.warn('تعذر تحميل مركز إدارة الاشتراك');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-commission-core.js?v=20260813-1';script.onerror=()=>console.warn('تعذر تحميل عمولة الاشتراك الرئيسية');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='subscription-revenue-integration.js?v=20260813-2';script.onerror=()=>console.warn('تعذر تحميل ربط إيرادات الاشتراك');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='commission-transfer-workflow.js?v=20260813-2';script.onerror=()=>console.warn('تعذر تحميل سير تحويل العمولة اليدوي');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='operational-reminders-center.js?v=20260808-3';script.onerror=()=>console.warn('تعذر تحميل مركز التنبيهات التشغيلية');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='professional-ui-stable.js?v=20260813-2';script.onerror=()=>console.warn('تعذر تحميل تحسينات الواجهة المستقرة');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='home-dashboard-polish.js?v=20260808-1';script.onerror=()=>console.warn('تعذر تحميل تحسينات الصفحة الرئيسية');document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.async=false;script.src='daily-operations-policy.js?v=20260813-2';script.onerror=()=>console.warn('تعذر تحميل سياسة التشغيل اليومية');document.head.appendChild(script)})();
