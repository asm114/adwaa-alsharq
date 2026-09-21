(()=>{
'use strict';
const root=typeof window!=='undefined'?window:globalThis;
if(root.__adwaaBookingDateStabilityInstalled)return;
root.__adwaaBookingDateStabilityInstalled=true;

const AR='٠١٢٣٤٥٦٧٨٩',FA='۰۱۲۳۴۵۶۷۸۹';
function ascii(value){
  return String(value??'')
    .replace(/[٠-٩]/g,ch=>String(AR.indexOf(ch)))
    .replace(/[۰-۹]/g,ch=>String(FA.indexOf(ch)))
    .trim();
}
function validIso(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return false;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const check=new Date(Date.UTC(y,mo-1,d));
  return check.getUTCFullYear()===y&&check.getUTCMonth()===mo-1&&check.getUTCDate()===d;
}
function normalizeDate(value){
  let raw=ascii(value).replace(/[.\\]/g,'/').replace(/\s+/g,'');
  if(validIso(raw))return raw;
  raw=raw.replace(/-/g,'/');
  const parts=raw.split('/').filter(Boolean);
  if(parts.length!==3)return '';
  let y,m,d;
  if(parts[0].length===4){y=Number(parts[0]);m=Number(parts[1]);d=Number(parts[2]);}
  else{d=Number(parts[0]);m=Number(parts[1]);y=Number(parts[2]);}
  if(y<100)y+=2000;
  const iso=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return validIso(iso)?iso:'';
}
function field(){return typeof document!=='undefined'?document.getElementById('bDate'):null}
function picker(){return typeof document!=='undefined'?document.getElementById('bDateNativePicker'):null}
function syncPicker(){
  const input=field(),native=picker();if(!input||!native)return;
  const iso=normalizeDate(input.value);
  if(iso)native.value=iso;
}
function finalize({alertOnError=false}={}){
  const input=field();if(!input)return false;
  const iso=normalizeDate(input.value);
  if(!iso){
    input.setCustomValidity('أدخل تاريخ حجز صحيح.');
    if(alertOnError)alert('تاريخ الحجز غير صحيح. استخدم مثال 2026-09-25 أو ٢٥/٩/٢٠٢٦.');
    input.focus();
    return false;
  }
  input.value=iso;input.dataset.requestedBookingDate=iso;input.setCustomValidity('');
  syncPicker();
  return true;
}
function enhance(){
  const input=field();if(!input||input.dataset.bookingDateEnhanced==='1')return !!input;
  input.dataset.bookingDateEnhanced='1';
  input.dataset.originalType=input.type||'date';
  input.type='text';
  input.inputMode='numeric';
  input.autocomplete='off';
  input.placeholder='2026-09-25 أو ٢٥/٩/٢٠٢٦';
  input.setAttribute('dir','ltr');

  const wrap=document.createElement('div');wrap.className='booking-date-stable-control';
  input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);

  const button=document.createElement('button');button.type='button';button.className='secondary booking-date-picker-button';button.textContent='📅 اختيار من التقويم';
  const native=document.createElement('input');native.type='date';native.id='bDateNativePicker';native.tabIndex=-1;native.setAttribute('aria-hidden','true');native.className='booking-date-native-picker';
  wrap.appendChild(button);wrap.appendChild(native);

  button.addEventListener('click',()=>{
    syncPicker();
    try{if(typeof native.showPicker==='function')native.showPicker();else native.click();}catch(_){native.click();}
  });
  native.addEventListener('change',()=>{
    if(!native.value)return;
    input.value=native.value;input.dataset.requestedBookingDate=native.value;input.setCustomValidity('');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  input.addEventListener('input',()=>{
    const converted=ascii(input.value).replace(/[.\\]/g,'/');
    if(converted!==input.value)input.value=converted;
    input.dataset.requestedBookingDate=input.value;
    input.setCustomValidity('');
  });
  input.addEventListener('change',()=>finalize());
  input.addEventListener('blur',()=>{if(input.value)finalize()});

  const form=document.getElementById('bookingForm');
  form?.addEventListener('submit',event=>{
    if(!finalize({alertOnError:true})){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);

  const style=document.createElement('style');style.id='bookingDateStabilityStyles';style.textContent=`
    .booking-date-stable-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
    .booking-date-picker-button{white-space:nowrap}
    .booking-date-native-picker{position:fixed!important;left:-9999px!important;top:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
    @media(max-width:620px){.booking-date-stable-control{grid-template-columns:1fr}.booking-date-picker-button{width:100%}}
  `;document.head.appendChild(style);
  return true;
}
function syncAfterOpen(){
  const input=field();if(!input)return;
  const iso=normalizeDate(input.value);
  if(iso){input.value=iso;input.dataset.requestedBookingDate=iso;syncPicker();}
}
function wrapOpen(){
  const current=root.openBooking;if(typeof current!=='function'||current.__bookingDateStabilityWrapped)return false;
  const wrapped=function(...args){const result=current.apply(this,args);setTimeout(syncAfterOpen,0);return result};
  wrapped.__bookingDateStabilityWrapped=true;wrapped.__base=current;root.openBooking=wrapped;try{openBooking=wrapped}catch(_){}
  return true;
}
function install(){
  enhance();wrapOpen();syncAfterOpen();
  let tries=0;const timer=setInterval(()=>{tries++;enhance();wrapOpen();if(tries>=24)clearInterval(timer)},250);
}
root.BookingDateStability={normalizeDate,validIso,finalize,syncAfterOpen};
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
}
if(typeof module!=='undefined'&&module.exports)module.exports={normalizeDate,validIso};
})();