(function(root){
  'use strict';
  if(root.__adwaaBookingPostponementInstalled)return;
  root.__adwaaBookingPostponementInstalled=true;

  const isPostponed=booking=>/مؤجل|postpon/i.test(String(booking?.status||''));
  const nowIso=()=>new Date().toISOString();

  function prepareForSave(previous,next,at=nowIso()){
    const before=previous||{},booking={...(next||{})};
    if(isPostponed(booking)){
      const previousDate=String(before.postponedFromDate||before.date||booking.postponedFromDate||booking.date||'');
      booking.postponedFromDate=previousDate;
      booking.postponedAt=before.status==='مؤجل'&&before.postponedAt?before.postponedAt:at;
      booking.date='';
      booking.resumedAt='';
      return booking;
    }
    if(isPostponed(before)){
      if(!String(booking.date||'').trim())throw new Error('حدد موعدًا جديدًا قبل إعادة تفعيل الحجز المؤجل.');
      booking.resumedAt=at;
    }
    return booking;
  }

  function syncForm(){
    if(typeof document==='undefined')return false;
    const status=document.getElementById('bStatus'),date=document.getElementById('bDate');
    if(!status||!date)return false;
    const postponed=status.value==='مؤجل';
    if(postponed&&date.value)date.dataset.postponedFromDate=date.value;
    if(postponed)date.value='';
    date.required=!postponed;
    date.disabled=postponed;
    date.setCustomValidity('');
    const picker=document.getElementById('bDateNativePicker');if(picker)picker.disabled=postponed;
    let note=document.getElementById('bookingPostponementNotice');
    if(!note){
      note=document.createElement('div');note.id='bookingPostponementNotice';note.className='full notice';
      const section=status.closest('.booking-form-section')?.querySelector('.booking-section-grid');
      section?.appendChild(note);
    }
    if(note){note.style.display=postponed?'block':'none';note.textContent='الحجز مؤجل بلا موعد: الدفعات محفوظة، التاريخ محرر، ولا يظهر مبلغ للتحصيل حتى تحديد موعد جديد.'}
    const hint=document.getElementById('dateHint');if(hint&&postponed)hint.textContent='لا يشغل الحجز المؤجل أي يوم في التقويم.';
    return postponed;
  }

  function install(){
    const status=document.getElementById('bStatus');
    if(status&&status.dataset.postponementBound!=='1'){
      status.dataset.postponementBound='1';status.addEventListener('change',syncForm);
    }
    const current=root.openBooking;
    if(typeof current==='function'&&!current.__postponementWrapped){
      const wrapped=function(...args){const result=current.apply(this,args);setTimeout(syncForm,0);return result};
      wrapped.__postponementWrapped=true;wrapped.__base=current;root.openBooking=wrapped;try{openBooking=wrapped}catch(_){}
    }
    syncForm();
  }

  root.BookingPostponement={isPostponed,prepareForSave,syncForm};
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={isPostponed,prepareForSave};
})(typeof window!=='undefined'?window:globalThis);
