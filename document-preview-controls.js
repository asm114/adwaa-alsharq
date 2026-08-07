(()=>{
'use strict';
if(window.__adwaaDocumentPreviewControlsInstalled)return;
window.__adwaaDocumentPreviewControlsInstalled=true;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();

function isDocumentPreview(){
  const text=norm(document.body?.innerText||'');
  return /طباعة\s*\/\s*حفظ\s*PDF|شروط الحجز|توقيع العميل/.test(text);
}

function ensureControls(){
  if(!isDocumentPreview())return;
  if(document.getElementById('adwaaDocumentPreviewControls'))return;
  const printBtn=[...document.querySelectorAll('button')].find(b=>/طباعة\s*\/\s*حفظ\s*PDF/.test(norm(b.textContent)));
  const root=document.createElement('div');
  root.id='adwaaDocumentPreviewControls';
  root.setAttribute('role','toolbar');
  root.innerHTML=`<button type="button" data-action="back">← رجوع للنظام</button><button type="button" data-action="share">مشاركة</button>`;
  const style=document.createElement('style');
  style.textContent=`#adwaaDocumentPreviewControls{position:fixed;top:max(14px,env(safe-area-inset-top));right:14px;z-index:9999;display:flex;gap:8px;direction:rtl}#adwaaDocumentPreviewControls button{border:0;border-radius:14px;padding:11px 15px;font:800 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.15);background:#0f7866;color:#fff}#adwaaDocumentPreviewControls button[data-action="share"]{background:#fff;color:#0f7866;border:1px solid #b9cec8}@media print{#adwaaDocumentPreviewControls{display:none!important}}`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  root.querySelector('[data-action="back"]').addEventListener('click',()=>{
    try{
      if(window.opener&&!window.opener.closed){window.close();return;}
    }catch(_){/* ignore */}
    if(history.length>1){history.back();return;}
    location.href='./';
  });

  const shareBtn=root.querySelector('[data-action="share"]');
  if(!navigator.share){shareBtn.style.display='none'}
  else shareBtn.addEventListener('click',async()=>{
    try{
      await navigator.share({title:document.title||'مستند منتجع أضواء الشرق',text:'مستند من نظام إدارة منتجع أضواء الشرق',url:location.href});
    }catch(err){if(err?.name!=='AbortError')alert('تعذرت المشاركة من هذه الشاشة. استخدم طباعة / حفظ PDF ثم شارك الملف من الجهاز.');}
  });

  if(printBtn&&printBtn.parentElement){
    printBtn.parentElement.style.position=printBtn.parentElement.style.position||'relative';
  }
}

function init(){ensureControls();setTimeout(ensureControls,400);setTimeout(ensureControls,1200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
new MutationObserver(()=>ensureControls()).observe(document.documentElement,{childList:true,subtree:true});
})();
