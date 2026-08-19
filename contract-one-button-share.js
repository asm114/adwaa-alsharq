(()=>{
'use strict';
if(window.__adwaaOneButtonContractShareInstalled)return;
window.__adwaaOneButtonContractShareInstalled=true;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const digits=value=>String(value||'').replace(/\D/g,'');

function currentBooking(){
  try{if(typeof window.v92Booking==='function')return window.v92Booking()}catch(_){}
  const id=String(document.getElementById('bId')?.value||'').trim();
  return Array.isArray(window.db?.bookings)?window.db.bookings.find(row=>String(row?.id||'')===id)||null:null;
}

function currentForm(){
  try{if(typeof window.getBookingFromForm==='function')return window.getBookingFromForm()}catch(_){}
  return currentBooking();
}

function contractCard(){
  return document.querySelector('[data-v92-action="contract-create"]')?.closest('.v92-operation-card')||null;
}

function targetText(form){
  const name=String(form?.name||'العميل').trim()||'العميل';
  const phone=String(form?.phone||'').trim();
  return phone?`أرسل إلى: ${name} — ${phone}`:`أرسل إلى: ${name} — لا يوجد رقم جوال`;
}

function buildStaticContractFile(html,form){
  const parser=new DOMParser();
  const doc=parser.parseFromString(String(html||''),'text/html');
  doc.querySelector('#adwaaDocToolbar')?.remove();
  doc.querySelectorAll('script').forEach(node=>node.remove());
  const bookingCode=String(form?.code||currentBooking()?.code||'').trim();
  const customer=String(form?.name||'العميل').trim()||'العميل';
  const fileName=`عقد-${bookingCode||customer}.html`.replace(/[\\/:*?"<>|]+/g,'-');
  const source='<!doctype html>\n'+doc.documentElement.outerHTML;
  return new File([source],fileName,{type:'text/html;charset=utf-8',lastModified:Date.now()});
}

function downloadFile(file){
  const url=URL.createObjectURL(file),link=document.createElement('a');
  link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

async function shareContract(){
  const booking=currentBooking(),form=currentForm();
  if(!booking){alert('احفظ الحجز أولًا قبل مشاركة العقد.');return}
  if(!form?.name||!form?.date){alert('أدخل اسم العميل وتاريخ الحجز أولًا.');return}
  const phone=String(form?.phone||booking?.phone||'').trim();
  if(!digits(phone)){alert('أضف رقم جوال العميل أولًا حتى يظهر لك المستلم الصحيح.');return}
  if(typeof window.bookingDocumentHTML!=='function'){alert('تعذر تجهيز ملف العقد الآن. حدّث الصفحة وحاول مرة أخرى.');return}

  const button=document.querySelector('[data-v92-action="contract-share-file"]');
  if(button){button.disabled=true;button.textContent='جاري تجهيز العقد…'}
  try{
    const html=window.bookingDocumentHTML(form,'contract');
    const file=buildStaticContractFile(html,form);
    if(typeof window.v92RecordOperation==='function')await window.v92RecordOperation('contract','created');
    const name=String(form?.name||booking?.name||'العميل').trim()||'العميل';
    const shareText=`عقد ${name} — رقم العميل ${phone}`;
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({title:`عقد ${name}`,text:shareText,files:[file]});
      if(typeof window.v92RecordOperation==='function')await window.v92RecordOperation('contract','sent');
      return;
    }
    downloadFile(file);
    alert(`تم تجهيز ملف العقد. جهازك لا يدعم إرفاقه مباشرة من المتصفح. أرسله إلى ${name} على الرقم ${phone}.`);
  }catch(error){
    if(error?.name==='AbortError')return;
    console.error('تعذر مشاركة ملف العقد.',error);
    alert('تعذرت مشاركة ملف العقد. جرّب مرة أخرى.');
  }finally{
    refresh();
  }
}

function refresh(){
  const card=contractCard();if(!card)return;
  const row=card.querySelector('.v92-action-row');if(!row)return;
  let button=row.querySelector('[data-v92-action="contract-share-file"]');
  if(!button){
    row.querySelectorAll('[data-v92-action="contract-create"],[data-v92-action="contract-send"]').forEach(node=>node.remove());
    button=document.createElement('button');
    button.type='button';button.className='primary';button.dataset.v92Action='contract-share-file';
    button.textContent='📎 مشاركة ملف العقد';
    button.addEventListener('click',shareContract);
    row.appendChild(button);
  }
  let target=card.querySelector('[data-contract-share-target]');
  if(!target){
    target=document.createElement('div');target.dataset.contractShareTarget='1';target.className='meta';
    target.style.cssText='margin-top:8px;font-weight:800;color:#0d4c3f';
    row.insertAdjacentElement('afterend',target);
  }
  const booking=currentBooking(),form=currentForm();
  target.innerHTML=esc(targetText(form));
  button.disabled=!booking||!digits(form?.phone||booking?.phone||'');
  button.textContent='📎 مشاركة ملف العقد';
}

function start(){
  refresh();
  document.addEventListener('input',event=>{if(event.target?.id==='bName'||event.target?.id==='bPhone')refresh()});
  window.addEventListener('focus',refresh);
  window.addEventListener('adwaa-subscription-updated',refresh);
  new MutationObserver(()=>queueMicrotask(refresh)).observe(document.body,{subtree:true,childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
