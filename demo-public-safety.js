(()=>{
'use strict';
if(window.__adwaaPublicDemoSafetyInstalled)return;
window.__adwaaPublicDemoSafetyInstalled=true;
window.ADWAA_PUBLIC_DEMO=true;

const whatsappPattern=/(?:wa\.me|api\.whatsapp\.com)/i;
const nativeOpen=window.open.bind(window);
const blockedMessage='هذه نسخة تجريبية. الإرسال الخارجي معطل.';

window.open=function(url,...args){
  if(whatsappPattern.test(String(url||''))){
    alert(blockedMessage);
    return null;
  }
  return nativeOpen(url,...args);
};

document.addEventListener('click',event=>{
  const target=event.target?.closest?.('a,button');
  if(!target)return;
  const href=String(target.getAttribute?.('href')||'');
  const marker=`${target.id||''} ${target.textContent||''}`;
  if(whatsappPattern.test(href)||/واتساب/i.test(marker)){
    event.preventDefault();
    event.stopImmediatePropagation();
    alert(blockedMessage);
  }
},true);

function installBanner(){
  if(!document.body||document.getElementById('publicDemoBanner'))return;
  const style=document.createElement('style');
  style.id='publicDemoBannerStyles';
  style.textContent=`
    #publicDemoBanner{position:sticky;top:0;z-index:100000;background:#fff3d9;border-bottom:1px solid #e4c46f;color:#76520b;text-align:center;padding:9px 14px;font:800 13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}
    #headerWhatsappButton,#heroWhatsappButton,#contactWhatsappButton,#contactMapsButton,#contactInstagramButton,#floatingWhatsappButton,#bookingRequestButton,#contactEmailRow{display:none!important}
    #contactWhatsappNumber{font-size:0!important}
    #contactWhatsappNumber::after{content:'معطل في النسخة التجريبية';font-size:14px!important}
  `;
  document.head?.appendChild(style);
  const banner=document.createElement('div');
  banner.id='publicDemoBanner';
  banner.setAttribute('role','status');
  banner.textContent='نسخة تجريبية — جميع البيانات وهمية — الإرسال الخارجي معطل';
  document.body.prepend(banner);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installBanner,{once:true});
else installBanner();
})();