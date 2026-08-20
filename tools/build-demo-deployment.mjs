import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const out=join(root,'dist');

const excludedTopLevel=new Set(['.git','.github','.impeccable','.vercel','node_modules','dist','supabase','tests','tools']);
const excludedFiles=new Set([
  'AGENTS.md','BRANDING_LAYER_STATUS.md','COMMERCIAL_MIGRATIONS_STATUS.md','COMMERCIAL_TEMPLATE_SETUP.md',
  'CUSTOMER_PORTAL_REFERENCE.md','DESIGN.md','PRODUCT.md','PROJECT_CONTEXT.md','PROPRIETARY_NOTICE.md',
  'PROVISIONER.md','SECURE_APPLY.md','SUBSCRIPTION_HARDENING_PLAN.md','README.txt','pages-redeploy.txt',
  'backup-before-v9.5-RC1-2026-07-22.html','index-v9.0-before-RC1.html'
]);

function shouldCopy(source){
  const rel=relative(root,source);
  if(!rel)return true;
  const [top]=rel.split(sep);
  if(excludedTopLevel.has(top))return false;
  if(!rel.includes(sep)&&excludedFiles.has(rel))return false;
  return true;
}

await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const entry of await readdir(root,{withFileTypes:true})){
  const source=join(root,entry.name);
  if(!shouldCopy(source))continue;
  await cp(source,join(out,entry.name),{recursive:true,filter:shouldCopy});
}

const requiredUiAssets=[
  'index.html','app-experience-pro.css','home-dashboard-polish.css','home-dashboard-polish.js',
  'professional-ui-cleanup.css','professional-ui-cleanup.js','professional-ui-stable.js',
  'simplified-ui.css','simplified-ui-mobile.css','simplified-ui.js','demo-local-runtime.js'
];
for(const asset of requiredUiAssets){
  const info=await stat(join(out,asset)).catch(()=>null);
  if(!info?.isFile())throw new Error(`Demo build is missing required current UI asset: ${asset}`);
}

const configPath=join(out,'supabase-config.staging.js');
const demoConfig=`(()=>{
'use strict';
window.ADWAA_PUBLIC_DEMO=true;
const core=Object.freeze({projectRef:'democorelocal2026',publishableKey:'sb_publishable_demo_local_core_2026',url:'https://demo-core.invalid'});
const portal=Object.freeze({projectRef:'demoportallocal2026',publishableKey:'sb_publishable_demo_local_portal_2026',url:'https://demo-portal.invalid'});
const commercialConfig=Object.freeze({
  schemaVersion:1,
  deploymentId:'demo-public-2026',
  runtimeEnvironment:'staging',
  basePath:'/',
  namespace:Object.freeze({storage:'demo-public-2026-storage',auth:'demo-public-2026-auth',cache:'demo-public-2026-cache'}),
  brand:Object.freeze({name:'نسخة العرض التجريبية',businessType:'نظام إدارة المنتجعات',displayName:'نظام إدارة المنتجعات — نسخة العرض التجريبية',location:'بيانات تجريبية',description:'نسخة تجريبية لاستعراض نظام إدارة المنتجعات ببيانات وهمية فقط.',mark:'ع'}),
  ownership:Object.freeze({ownerName:'عبدالعزيز الفوزان',copyrightYear:2026,authorizedCustomer:'نسخة العرض التجريبية للنظام',clientId:'DEMO-2026'}),
  backends:Object.freeze({core,portal})
});
window.ADWAA_COMMERCIAL_CONFIG=commercialConfig;
window.ADWAA_SUPABASE_CONFIG=Object.freeze({environment:'staging',runtimeEnvironment:'staging',...core});
window.ADWAA_PORTAL_SUPABASE_CONFIG=Object.freeze({environment:'staging',runtimeEnvironment:'staging',...portal});
window.__adwaaValidateStagingSupabaseConfig=value=>Object.freeze({...value,runtimeEnvironment:'staging'});
if(typeof document!=='undefined'&&!window.__commercialBrandingLoaderInstalled){
  window.__commercialBrandingLoaderInstalled=true;
  const script=document.createElement('script');
  script.async=false;
  script.src='/commercial-branding.js?v=20260820-2';
  document.head.appendChild(script);
}
})();\n`;
await writeFile(configPath,demoConfig,'utf8');

const textExtensions=new Set(['.html','.js','.json']);
const sensitiveReplacements=[
  ['منتجع أضواء الشرق','منتجع العرض التجريبي'],
  ['أضواء الشرق','العرض التجريبي'],
  ['القصيم – القاع البارد','بيانات تجريبية'],
  ['القاع البارد','بيانات تجريبية'],
  ['https://maps.app.goo.gl/uh8t93tMm5agNWvx7?g_st=com.google.maps.preview.copy','https://example.invalid/maps'],
  ['https://iwtsp.com/966560442799','https://example.invalid/whatsapp'],
  ['https://www.instagram.com/adwaa_al_sharq_resort?igsh=ODg0Z3AxZnNld2Jx&utm_source=q','https://example.invalid/instagram'],
  ['966560442799','00000000'],
  ['0560442799','0000000000'],
  ['adwaa_al_sharq_resort','demo_resort'],
  ['asm114@hotmail.com','demo.admin@example.invalid']
];
const forbiddenPersonalLiterals=['966560442799','0560442799','asm114@hotmail.com','maps.app.goo.gl/uh8t93tMm5agNWvx7','adwaa_al_sharq_resort'];

async function walkText(directory,handler){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){await walkText(full,handler);continue}
    if(entry.isFile()&&textExtensions.has(extname(entry.name)))await handler(full);
  }
}

await walkText(out,async full=>{
  const rel=relative(out,full).split(sep).join('/');
  if(rel==='commercial-branding.js')return;
  let text=await readFile(full,'utf8');
  for(const [from,to] of sensitiveReplacements)text=text.split(from).join(to);
  await writeFile(full,text,'utf8');
});

await walkText(out,async full=>{
  const rel=relative(out,full).split(sep).join('/');
  const text=await readFile(full,'utf8');
  for(const literal of forbiddenPersonalLiterals){
    if(text.includes(literal))throw new Error(`Demo output still contains a private AAS literal in ${rel}.`);
  }
  if(rel!=='commercial-branding.js'&&(text.includes('أضواء الشرق')||text.includes('القاع البارد'))){
    throw new Error(`Demo output still contains AAS-specific fallback branding in ${rel}.`);
  }
});

async function injectDemoLayers(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){await injectDemoLayers(full);continue}
    if(!entry.isFile()||!entry.name.endsWith('.html'))continue;
    let html=await readFile(full,'utf8');
    if(!html.includes('supabase-config.staging.js'))continue;
    const rel=relative(out,full).split(sep).join('/');
    const nested=rel.startsWith('resort/');
    const safetySrc=nested?'../demo-public-safety.js?v=20260820-6':'demo-public-safety.js?v=20260820-6';
    const runtimeSrc=nested?'../demo-local-runtime.js?v=20260820-3':'demo-local-runtime.js?v=20260820-3';
    const configPattern=/(<script\s+src=["'][^"']*supabase-config\.staging\.js[^"']*["'][^>]*><\/script>)/i;
    if(!configPattern.test(html))throw new Error(`Could not place demo safety layer in ${rel}.`);
    if(!html.includes('demo-public-safety.js'))html=html.replace(configPattern,`$1\n<script src="${safetySrc}"></script>`);

    const supabaseLibraryPattern=/(<script\s+src=["'][^"']*@supabase\/supabase-js@2[^"']*["'][^>]*><\/script>)/i;
    if(!supabaseLibraryPattern.test(html))throw new Error(`Could not place isolated visitor runtime after Supabase library in ${rel}.`);
    if(!html.includes('demo-local-runtime.js'))html=html.replace(supabaseLibraryPattern,`$1\n<script src="${runtimeSrc}"></script>`);
    await writeFile(full,html,'utf8');
  }
}
await injectDemoLayers(out);

const builtConfig=await readFile(configPath,'utf8');
if(!builtConfig.includes('democorelocal2026')||!builtConfig.includes('demoportallocal2026'))throw new Error('Demo build points to unexpected local demo backends.');
if(builtConfig.includes('supabase.co'))throw new Error('Public demo config must not point to a live Supabase host.');
if(builtConfig.includes('CHANGE_ME_'))throw new Error('Public demo config contains unresolved commercial placeholders.');
const builtRoot=await readFile(join(out,'index.html'),'utf8');
if(!builtRoot.includes('demo-local-runtime.js'))throw new Error('Public demo root is not isolated per visitor.');
const builtPortal=await readFile(join(out,'resort','index.html'),'utf8');
if(!builtPortal.includes('demo-local-runtime.js'))throw new Error('Public demo portal is not isolated per visitor.');
if(!builtPortal.includes('منتجع العرض التجريبي')||builtPortal.includes('أضواء الشرق'))throw new Error('Demo portal fallback branding was not sanitized correctly.');

console.log('Public demo build prepared in dist/ with current UI, fully local visitor isolation, scrubbed AAS fallbacks, and no live Supabase dependency.');