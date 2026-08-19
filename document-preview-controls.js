(()=>{
'use strict';
if(window.__adwaaDocumentPreviewControlsInstalled)return;
window.__adwaaDocumentPreviewControlsInstalled=true;

function escJs(value){return JSON.stringify(String(value??''));}

function subscriptionVisitDocumentEnhancements(b){
  if(!(b?.subscriptionVisit||b?.subscriptionId))return{style:'',body:'',script:''};
  const style=`<style>
    .adwaa-subscription-doc-note{margin:14px 0;padding:14px 16px;border:1px solid #9db8ff;background:#eef4ff;border-radius:14px;color:#183b82;line-height:1.8;font-weight:800}
    .adwaa-subscription-doc-note small{display:block;font-weight:500;color:#4e638f;margin-top:4px}
  </style>`;
  const body=`<div class="adwaa-subscription-doc-note">🎟️ هذه الزيارة مشمولة ضمن الاشتراك الرئيسي.<small>لا يوجد مبلغ مستقل لهذه الزيارة. قيمة الاشتراك والمدفوع والمتبقي تُدار من سجل الاشتراك الرئيسي.</small></div>`;
  const script=`<script>
    (function(){
      function normalizeSubscriptionDocument(){
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
        for(const node of nodes){
          const raw=String(node.nodeValue||'').trim();
          if(raw==='يومي')node.nodeValue='زيارة ضمن اشتراك دوري';
          if(raw==='لم يُحدد المبلغ'||raw==='لم يحدد المبلغ')node.nodeValue='مشمول ضمن الاشتراك الرئيسي';
          if(/^[٠0](?:[.,٫]?[٠0]+)?\s*(?:ر\.?س|ريال(?:\s+سعودي)?)?$/i.test(raw))node.nodeValue='—';
        }
      }
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',normalizeSubscriptionDocument,{once:true});else normalizeSubscriptionDocument();
    })();
  <\/script>`;
  return{style,body,script};
}

function enhanceGeneratedDocument(html,b,type){
  if(typeof html!=='string'||!html.includes('<body>'))return html;
  const title=type==='invoice'?'فاتورة حجز':'عقد حجز';
  const customer=String(b?.name||'العميل');
  const bookingCode=String(b?.code||'').trim();
  const phone=String(b?.phone||'').replace(/\D/g,'');
  const waPhone=phone.startsWith('0')?`966${phone.slice(1)}`:phone;
  const shareText=`${title} — ${customer}${bookingCode?` — ${bookingCode}`:''}`;
  const fileName=`${type==='invoice'?'فاتورة':'عقد'}-${bookingCode||customer||'حجز'}.html`.replace(/[\\/:*?"<>|]+/g,'-');
  const toolbar=`<div id="adwaaDocToolbar" class="actions" style="display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;z-index:9999;background:#f7f7f5;padding:10px 12px;border-bottom:1px solid #dfe5e2;direction:rtl">
    <button type="button" onclick="adwaaBackToSystem()" style="background:#fff;color:#0f7866;border:1px solid #9fc8bd">← رجوع للنظام</button>
    <button type="button" onclick="adwaaShareDocument()" style="background:#5f50d9;color:#fff">مشاركة الملف</button>
    ${waPhone?`<button type="button" onclick="adwaaSendCustomer()" style="background:#168f5b;color:#fff">فتح واتساب العميل</button>`:''}
    <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>`;
  const helpers=`<script>
    const ADWAA_DOC_TITLE=${escJs(title)};
    const ADWAA_DOC_CUSTOMER=${escJs(customer)};
    const ADWAA_DOC_SHARE_TEXT=${escJs(shareText)};
    const ADWAA_DOC_PHONE=${escJs(waPhone)};
    const ADWAA_DOC_FILE_NAME=${escJs(fileName)};
    function adwaaBackToSystem(){
      try{if(window.opener&&!window.opener.closed){window.close();return;}}catch(e){}
      if(history.length>1){history.back();return;}
      location.href='./';
    }
    function adwaaBuildDocumentFile(){
      const clone=document.documentElement.cloneNode(true);
      clone.querySelector('#adwaaDocToolbar')?.remove();
      clone.querySelectorAll('script').forEach(node=>node.remove());
      let baseHref='';
      try{baseHref=window.opener?.location?.href||'';}catch(_){}
      if(!baseHref&&document.baseURI&&!String(document.baseURI).startsWith('about:'))baseHref=document.baseURI;
      if(baseHref){
        const head=clone.querySelector('head');
        if(head){const base=document.createElement('base');base.href=baseHref;head.prepend(base);}
      }
      const source='<!doctype html>\n'+clone.outerHTML;
      return new File([source],ADWAA_DOC_FILE_NAME,{type:'text/html;charset=utf-8',lastModified:Date.now()});
    }
    function adwaaDownloadDocumentFile(file){
      const url=URL.createObjectURL(file),link=document.createElement('a');
      link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
    }
    async function adwaaShareDocument(){
      const file=adwaaBuildDocumentFile();
      try{
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
          await navigator.share({title:ADWAA_DOC_SHARE_TEXT,text:ADWAA_DOC_SHARE_TEXT,files:[file]});return;
        }
        adwaaDownloadDocumentFile(file);
        alert('جهازك لا يدعم إرفاق ملف العقد مباشرة من المتصفح. تم تنزيل نفس ملف العقد؛ شاركه من الملفات، أو استخدم طباعة / حفظ PDF إذا تريده بصيغة PDF.');
      }catch(e){
        if(e&&e.name==='AbortError')return;
        try{adwaaDownloadDocumentFile(file)}catch(_){}
        alert('تعذرت المشاركة المباشرة. تم تجهيز ملف العقد للتنزيل والمشاركة من الجهاز.');
      }
    }
    function adwaaSendCustomer(){
      if(!ADWAA_DOC_PHONE)return;
      const text='السلام عليكم، ${title} الخاص بك من منتجع أضواء الشرق. سأرسل لك ملف العقد/الفاتورة كمرفق.';
      location.href='https://wa.me/'+ADWAA_DOC_PHONE+'?text='+encodeURIComponent(text);
    }
  <\/script>`;
  const printStyle='<style>@media print{#adwaaDocToolbar{display:none!important}}</style>';
  const subscription=subscriptionVisitDocumentEnhancements(b);
  let out=html.replace('<body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div>',`<body>${toolbar}${subscription.body}`);
  if(out===html)out=html.replace('<body>',`<body>${toolbar}${subscription.body}`);
  out=out.replace('</head>',`${printStyle}${subscription.style}</head>`);
  out=out.replace('</body>',`${helpers}${subscription.script}</body>`);
  return out;
}

function installWrapper(){
  if(typeof window.bookingDocumentHTML!=='function')return false;
  if(window.bookingDocumentHTML.__adwaaDocToolbarWrapped)return true;
  const original=window.bookingDocumentHTML;
  const wrapped=function(b,type){return enhanceGeneratedDocument(original.apply(this,arguments),b,type)};
  wrapped.__adwaaDocToolbarWrapped=true;
  wrapped.__adwaaOriginal=original;
  window.bookingDocumentHTML=wrapped;
  return true;
}

function init(){
  if(installWrapper())return;
  let tries=0;
  const timer=setInterval(()=>{tries++;if(installWrapper()||tries>=40)clearInterval(timer)},150);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
