(()=>{
'use strict';
if(window.__adwaaDocumentPreviewControlsInstalled)return;
window.__adwaaDocumentPreviewControlsInstalled=true;

function escJs(value){return JSON.stringify(String(value??'')).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}

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
  const phone=String(b?.phone||'').replace(/\D/g,'');
  const waPhone=phone.startsWith('0')?`966${phone.slice(1)}`:phone;
  const shareText=`${title} — ${customer}${b?.code?` — ${b.code}`:''}`;
  const toolbar=`<div id="adwaaDocToolbar" class="actions" style="display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;z-index:9999;background:#f7f7f5;padding:10px 12px;border-bottom:1px solid #dfe5e2;direction:rtl">
    <button type="button" onclick="adwaaBackToSystem()" style="background:#fff;color:#0f7866;border:1px solid #9fc8bd">← رجوع للنظام</button>
    <button type="button" onclick="adwaaShareDocument()" style="background:#5f50d9;color:#fff">مشاركة</button>
    ${waPhone?`<button type="button" onclick="adwaaSendCustomer()" style="background:#168f5b;color:#fff">إرسال للعميل</button>`:''}
    <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>`;
  const helpers=`<script>
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
      const text='السلام عليكم، ${title} الخاص بك من منتجع أضواء الشرق. بعد حفظ ملف PDF يمكنك إرفاقه وإرساله هنا.';
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
