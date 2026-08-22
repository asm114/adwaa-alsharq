(()=>{
'use strict';
if(window.__adwaaGeneratedDocumentToolbarInstalled)return;
window.__adwaaGeneratedDocumentToolbarInstalled=true;

function escJs(value){return JSON.stringify(String(value??'')).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}

function enhance(html,b,type){
  if(typeof html!=='string'||!html.includes('<body>'))return html;
  const title=type==='invoice'?'فاتورة حجز':'عقد حجز';
  const customer=String(b?.name||'العميل');
  const phone=String(b?.phone||'').replace(/\D/g,'');
  const waPhone=phone.startsWith('0')?`966${phone.slice(1)}`:phone;
  const shareText=`${title} — ${customer}${b?.code?` — ${b.code}`:''}`;
  const toolbar=`<div id="adwaaDocToolbar" class="actions" style="display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;z-index:9999;background:#f7f7f5;padding:10px 12px;border-bottom:1px solid #dfe5e2;direction:rtl">
    <button type="button" onclick="adwaaBackToSystem()" style="background:#fff;color:#0f7866;border:1px solid #9fc8bd">← رجوع للنظام</button>
    <button type="button" id="adwaaShareBtn" onclick="adwaaShareDocument()" style="background:#5f50d9;color:#fff">مشاركة</button>
    ${waPhone?`<button type="button" onclick="adwaaSendCustomer()" style="background:#168f5b;color:#fff">إرسال للعميل</button>`:''}
    <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>`;
  const script=`<script>
    const ADWAA_DOC_TITLE=${escJs(title)};
    const ADWAA_DOC_CUSTOMER=${escJs(customer)};
    const ADWAA_DOC_SHARE_TEXT=${escJs(shareText)};
    const ADWAA_DOC_PHONE=${escJs(waPhone)};
    function adwaaBackToSystem(){
      try{if(window.opener&&!window.opener.closed){window.close();return;}}catch(e){}
      if(history.length>1){history.back();return;}
      location.href='./';
    }
    async function adwaaShareDocument(){
      try{
        if(navigator.share){await navigator.share({title:ADWAA_DOC_SHARE_TEXT,text:ADWAA_DOC_SHARE_TEXT});return;}
        alert('المشاركة المباشرة غير مدعومة هنا. استخدم طباعة / حفظ PDF ثم شارك الملف من الجهاز.');
      }catch(e){if(e&&e.name!=='AbortError')alert('تعذرت المشاركة. احفظ PDF ثم شاركه من الجهاز.');}
    }
    function adwaaSendCustomer(){
      if(!ADWAA_DOC_PHONE)return;
      const text='السلام عليكم، ${title} الخاص بك من منتجع أضواء الشرق. يمكن إرفاق ملف PDF بعد حفظه من زر طباعة / حفظ PDF.';
      location.href='https://wa.me/'+ADWAA_DOC_PHONE+'?text='+encodeURIComponent(text);
    }
  <\/script>`;
  const printOnlyStyle=`<style>@media print{#adwaaDocToolbar{display:none!important}}</style>`;
  let out=html.replace('<body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div>',`<body>${toolbar}`);
  if(out===html)out=html.replace('<body>',`<body>${toolbar}`);
  return out.replace('</head>',`${printOnlyStyle}</head>`).replace('</body>',`${script}</body>`);
}

function install(){
  if(typeof window.bookingDocumentHTML!=='function'||window.bookingDocumentHTML.__adwaaWrapped)return false;
  const original=window.bookingDocumentHTML;
  const wrapped=function(b,type){return enhance(original.apply(this,arguments),b,type)};
  wrapped.__adwaaWrapped=true;
  wrapped.__adwaaOriginal=original;
  window.bookingDocumentHTML=wrapped;
  return true;
}

if(!install()){
  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer)},150);
}
})();
