(()=>{
'use strict';
if(window.__adwaaSubscriptionBookingTypeInstalled)return;
window.__adwaaSubscriptionBookingTypeInstalled=true;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function addSubscriptionOption(){
  const type=document.getElementById('bType');
  if(!type)return false;
  if(![...type.options].some(option=>option.value==='اشتراك دوري')){
    const option=document.createElement('option');
    option.value='اشتراك دوري';
    option.textContent='اشتراك دوري';
    type.appendChild(option);
  }
  if(type.dataset.subscriptionBookingBound==='1')return true;
  type.dataset.subscriptionBookingBound='1';
  type.addEventListener('change',handleBookingTypeChange);
  return true;
}

function handleBookingTypeChange(event){
  if(event.target.value!=='اشتراك دوري')return;
  const name=String(document.getElementById('bName')?.value||'').trim();
  const phone=String(document.getElementById('bPhone')?.value||'').trim();
  if(!name||!phone){
    event.target.value='يومي';
    alert('اكتب اسم العميل ورقم الجوال أولًا، ثم اختر اشتراك دوري.');
    document.getElementById(!name?'bName':'bPhone')?.focus();
    return;
  }
  launchSubscriptionFromBooking(name,phone);
}

function launchSubscriptionFromBooking(name,phone){
  if(typeof window.openSubscriptionModal!=='function'){
    alert('تعذر فتح الاشتراك الآن. حدّث الصفحة وحاول مرة أخرى.');
    document.getElementById('bType').value='يومي';
    return;
  }
  const total=Number(document.getElementById('bTotal')?.value||0);
  const paid=Number(document.getElementById('bPaid')?.value||0);
  const notes=String(document.getElementById('bNotes')?.value||'').trim();
  window.openSubscriptionModal();
  setTimeout(()=>{
    const customer=document.getElementById('subCustomer');
    if(!customer)return;
    let option=[...customer.options].find(item=>item.dataset.phone===phone);
    if(!option){
      option=document.createElement('option');
      option.value=`new:${phone}`;
      option.dataset.name=name;
      option.dataset.phone=phone;
      option.textContent=`${name} — ${phone} (عميل جديد)`;
      customer.prepend(option);
    }
    customer.value=option.value;
    option.selected=true;
    const totalInput=document.getElementById('subTotal');
    const paidInput=document.getElementById('subPaid');
    const noteInput=document.getElementById('subNote');
    if(totalInput&&total>0)totalInput.value=String(total);
    if(paidInput&&paid>0)paidInput.value=String(Math.min(total||paid,paid));
    if(noteInput&&notes)noteInput.value=notes;
    customer.dispatchEvent(new Event('input',{bubbles:true}));
  },0);
  document.getElementById('bookingModal')?.classList.remove('open');
  document.getElementById('bType').value='يومي';
}

function wrapOpenBooking(){
  if(typeof window.openBooking!=='function'||window.openBooking.__subscriptionTypeWrapped)return;
  const original=window.openBooking;
  const wrapped=function(...args){
    const result=original.apply(this,args);
    setTimeout(addSubscriptionOption,0);
    return result;
  };
  wrapped.__subscriptionTypeWrapped=true;
  window.openBooking=wrapped;
}

function initialize(){
  addSubscriptionOption();
  wrapOpenBooking();
  setTimeout(()=>{addSubscriptionOption();wrapOpenBooking()},600);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();

// مسودات الاشتراكات: حجز مبدئي 24 ساعة ثم اعتماد وترحيل للبوابة.
(()=>{const script=document.createElement('script');script.src='subscription-draft-workflow.js';script.defer=true;document.head.appendChild(script)})();
