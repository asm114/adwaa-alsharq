(()=>{
'use strict';
if(window.__commercialBrandingInstalled)return;
window.__commercialBrandingInstalled=true;

const config=window.ADWAA_COMMERCIAL_CONFIG;
if(!config?.brand||!config?.ownership)throw new Error('Commercial branding requires ADWAA_COMMERCIAL_CONFIG.');
const brand=config.brand,ownership=config.ownership;
const replacements=[
  ['منتجع أضواء الشرق',brand.displayName],
  ['أضواء الشرق',brand.name],
  ['القاع البارد',brand.location],
  ['Adwaa Al Sharq',brand.name],
  ['Adwaa AlSharq',config.deploymentId]
];

function replaceLegacyText(value){
  let text=String(value??'');
  for(const [from,to] of replacements)text=text.split(from).join(to);
  return text;
}

function syncWorkerIdentity(){
  const db=window.db;
  if(!db||typeof db!=='object')return;
  db.settings=db.settings&&typeof db.settings==='object'?db.settings:{};
  const currentName=String(db.settings.propertyName||'').trim();
  const currentType=String(db.settings.propertyType||'').trim();
  const legacyName=!currentName||currentName==='أضواء الشرق'||currentName==='منتجع أضواء الشرق';
  if(legacyName)db.settings.propertyName=brand.name;
  if(!currentType||(legacyName&&currentType==='منتجع'))db.settings.propertyType=brand.businessType;
}

function rewriteWhatsappLinks(root=document){
  root.querySelectorAll?.('a[href*="wa.me"],a[href*="api.whatsapp.com"]').forEach(link=>{
    try{
      const url=new URL(link.href,location.href),message=url.searchParams.get('text');
      if(!message)return;
      const branded=replaceLegacyText(message);
      if(branded!==message){url.searchParams.set('text',branded);link.href=url.toString()}
    }catch(_){/* Ignore malformed optional links. */}
  });
}

function rewriteTextNodes(root=document.body){
  if(!root||typeof document.createTreeWalker!=='function')return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    const parent=node.parentElement;
    if(parent?.closest?.('script,style,noscript'))return;
    const next=replaceLegacyText(node.nodeValue);
    if(next!==node.nodeValue)node.nodeValue=next;
  });
}

function rewriteAttributes(root=document){
  const attributes=['title','aria-label','alt','placeholder','content'];
  root.querySelectorAll?.('[title],[aria-label],[alt],[placeholder],[content]').forEach(element=>{
    for(const attribute of attributes){
      if(!element.hasAttribute(attribute))continue;
      const current=element.getAttribute(attribute),next=replaceLegacyText(current);
      if(next!==current)element.setAttribute(attribute,next);
    }
  });
}

function rewriteFormValues(root=document){
  root.querySelectorAll?.('textarea,input:not([type="password"]):not([type="file"])').forEach(element=>{
    if(typeof element.value!=='string')return;
    const next=replaceLegacyText(element.value);
    if(next!==element.value)element.value=next;
  });
}

function installDynamicManifest(){
  const link=document.querySelector('link[rel="manifest"]');
  if(!link||link.dataset.commercialBranding==='1')return;
  const manifest={
    name:`إدارة ${brand.displayName}`,
    short_name:brand.name,
    start_url:`${config.basePath}index.html`,
    scope:config.basePath,
    display:'standalone',
    background_color:'#f7f5ef',
    theme_color:'#0d4c3f',
    lang:'ar',
    dir:'rtl',
    icons:[]
  };
  const blob=new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});
  const href=URL.createObjectURL(blob);
  link.href=href;
  link.dataset.commercialBranding='1';
  window.addEventListener('pagehide',()=>URL.revokeObjectURL(href),{once:true});
}

function installOwnershipMetadata(){
  let meta=document.querySelector('meta[name="copyright"]');
  if(!meta){meta=document.createElement('meta');meta.name='copyright';document.head?.appendChild(meta)}
  if(meta)meta.content=`© ${ownership.copyrightYear} ${ownership.ownerName} — جميع الحقوق محفوظة`;
  document.documentElement.dataset.commercialClientId=ownership.clientId;
}

function installOwnershipNotice(){
  if(!document.body)return;
  let style=document.getElementById('commercialOwnershipStyles');
  if(!style){
    style=document.createElement('style');
    style.id='commercialOwnershipStyles';
    style.textContent='.commercial-ownership-notice{max-width:980px;margin:24px auto 112px;padding:10px 16px;text-align:center;font-size:12px;line-height:1.8;color:#6d817a;opacity:.9}.commercial-ownership-notice strong{color:inherit}.commercial-ownership-notice .commercial-ownership-use{display:block}@media(max-width:620px){.commercial-ownership-notice{padding-inline:18px;font-size:11px}}';
    document.head?.appendChild(style);
  }
  let notice=document.getElementById('commercialOwnershipNotice');
  if(!notice){
    notice=document.createElement('div');
    notice.id='commercialOwnershipNotice';
    notice.className='commercial-ownership-notice';
    notice.setAttribute('role','contentinfo');
    document.body.appendChild(notice);
  }
  notice.dataset.clientId=ownership.clientId;
  notice.innerHTML='';
  const rights=document.createElement('strong');
  rights.textContent=`© ${ownership.copyrightYear} ${ownership.ownerName} — جميع الحقوق محفوظة.`;
  const use=document.createElement('span');
  use.className='commercial-ownership-use';
  use.textContent=`هذه النسخة مصرح باستخدامها بواسطة ${ownership.authorizedCustomer}.`;
  notice.append(rights,use);
}

function applyBranding(){
  if(!document.documentElement)return;
  syncWorkerIdentity();
  rewriteTextNodes();
  rewriteAttributes();
  rewriteFormValues();
  rewriteWhatsappLinks();
  document.querySelectorAll('.brand-mark').forEach(element=>{element.textContent=brand.mark});
  document.title=replaceLegacyText(document.title||brand.displayName);
  const description=document.querySelector('meta[name="description"]');
  if(description)description.content=brand.description;
  installDynamicManifest();
  installOwnershipMetadata();
  installOwnershipNotice();
}

function scheduleBranding(){syncWorkerIdentity();queueMicrotask(applyBranding)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyBranding,{once:true});else applyBranding();
[0,250,1000,2500].forEach(delay=>setTimeout(applyBranding,delay));
document.addEventListener('click',scheduleBranding,true);
document.addEventListener('change',scheduleBranding,true);
window.addEventListener('adwaa-portal-admin-ready',scheduleBranding);
window.addEventListener('load',applyBranding,{once:true});
})();
