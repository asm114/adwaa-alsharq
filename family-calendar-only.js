(()=>{
'use strict';
if(window.__adwaaFamilyCalendarOnlyInstalled)return;
window.__adwaaFamilyCalendarOnlyInstalled=true;

function removeFamilyFromBookingLists(){
  document.querySelectorAll('#bookingList .item').forEach(item=>{
    if(item.querySelector('.family-badge')||/تواجد العائلة/.test(item.textContent||''))item.remove();
  });
}

function hideFamilySummaryOutsideCalendar(){
  const familyCount=document.getElementById('aboutFamilyDays');
  if(familyCount){
    const row=familyCount.closest('.about-row,.about-card,.stat');
    if(row)row.style.display='none';
  }
}

function makeFamilyCalendarReadOnly(){
  document.querySelectorAll('#calendar .day.family,.calendar .day.family').forEach(day=>{
    day.setAttribute('aria-label','تواجد العائلة — للعرض فقط');
    day.setAttribute('aria-disabled','true');
    day.style.cursor='default';
  });
}

function enforce(){
  removeFamilyFromBookingLists();
  hideFamilySummaryOutsideCalendar();
  makeFamilyCalendarReadOnly();
}

document.addEventListener('click',event=>{
  const familyDay=event.target.closest('#calendar .day.family,.calendar .day.family');
  if(!familyDay)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
},true);

const observer=new MutationObserver(()=>enforce());
function init(){
  enforce();
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(enforce,700);
  setTimeout(enforce,1600);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
