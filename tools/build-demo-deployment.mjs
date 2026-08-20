import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const out=join(root,'dist');

function requiredPublishableKey(name){
  const value=String(process.env[name]||'').trim();
  if(!value.startsWith('sb_publishable_'))throw new Error(`${name} must be a Supabase publishable key.`);
  return value;
}

const coreKey=requiredPublishableKey('DEMO_CORE_PUBLISHABLE_KEY');
const portalKey=requiredPublishableKey('DEMO_PORTAL_PUBLISHABLE_KEY');

const excludedTopLevel=new Set([
  '.git','.github','.impeccable','.vercel','node_modules','dist','supabase','tests','tools'
]);
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
  'index.html',
  'app-experience-pro.css',
  'home-dashboard-polish.css',
  'home-dashboard-polish.js',
  'professional-ui-cleanup.css',
  'professional-ui-cleanup.js',
  'professional-ui-stable.js',
  'simplified-ui.css',
  'simplified-ui-mobile.css',
  'simplified-ui.js'
];
for(const asset of requiredUiAssets){
  const info=await stat(join(out,asset)).catch(()=>null);
  if(!info?.isFile())throw new Error(`Demo build is missing required current UI asset: ${asset}`);
}

const configPath=join(out,'supabase-config.staging.js');
let config=await readFile(configPath,'utf8');
const replacements={
  CHANGE_ME_DEPLOYMENT_ID:'demo-public-2026',
  CHANGE_ME_BASE_PATH:'',
  CHANGE_ME_STORAGE_NAMESPACE:'demo-public-2026-storage',
  CHANGE_ME_AUTH_NAMESPACE:'demo-public-2026-auth',
  CHANGE_ME_CACHE_NAMESPACE:'demo-public-2026-cache',
  CHANGE_ME_BRAND_NAME:'نسخة العرض التجريبية',
  CHANGE_ME_BUSINESS_TYPE:'نظام إدارة المنتجعات',
  CHANGE_ME_LOCATION:'بيانات تجريبية',
  CHANGE_ME_BRAND_DESCRIPTION:'نسخة تجريبية لاستعراض نظام إدارة المنتجعات ببيانات وهمية فقط.',
  CHANGE_ME_AUTHORIZED_CUSTOMER:'نسخة العرض التجريبية للنظام',
  CHANGE_ME_CLIENT_ID:'DEMO-2026',
  CHANGE_ME_CORE_PROJECT_REF:'gjzdjotuhfzyihwarpfx',
  CHANGE_ME_CORE_PUBLISHABLE_KEY:coreKey,
  CHANGE_ME_PORTAL_PROJECT_REF:'iqybnohopudffvfntkit',
  CHANGE_ME_PORTAL_PUBLISHABLE_KEY:portalKey
};
for(const [from,to] of Object.entries(replacements))config=config.split(from).join(to);
if(config.includes('CHANGE_ME_'))throw new Error('Demo runtime config still contains unresolved placeholders.');
await writeFile(configPath,config,'utf8');

const portalTextExtensions=new Set(['.html','.js','.json']);
const portalReplacements=[
  ['منتجع أضواء الشرق','منتجع العرض التجريبي'],
  ['أضواء الشرق','العرض التجريبي'],
  ['القصيم – القاع البارد','بيانات تجريبية'],
  ['القاع البارد','بيانات تجريبية']
];

async function sanitizeDemoPortal(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){
      await sanitizeDemoPortal(full);
      continue;
    }
    if(!entry.isFile()||!portalTextExtensions.has(extname(entry.name)))continue;
    let text=await readFile(full,'utf8');
    for(const [from,to] of portalReplacements)text=text.split(from).join(to);
    await writeFile(full,text,'utf8');
  }
}

const portalRoot=join(out,'resort');
await sanitizeDemoPortal(portalRoot);

async function assertPortalSanitized(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){
      await assertPortalSanitized(full);
      continue;
    }
    if(!entry.isFile()||!portalTextExtensions.has(extname(entry.name)))continue;
    const text=await readFile(full,'utf8');
    if(text.includes('أضواء الشرق')||text.includes('القاع البارد')){
      throw new Error(`Demo portal still contains AAS-specific fallback data in ${relative(out,full)}.`);
    }
  }
}
await assertPortalSanitized(portalRoot);

async function injectDemoSafety(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){
      await injectDemoSafety(full);
      continue;
    }
    if(!entry.isFile()||!entry.name.endsWith('.html'))continue;
    let html=await readFile(full,'utf8');
    if(!html.includes('supabase-config.staging.js')||html.includes('demo-public-safety.js'))continue;
    const rel=relative(out,full);
    const safetySrc=rel.startsWith(`resort${sep}`)?'../demo-public-safety.js?v=20260820-2':'demo-public-safety.js?v=20260820-2';
    const pattern=/(<script\s+src=["'][^"']*supabase-config\.staging\.js[^"']*["'][^>]*><\/script>)/i;
    if(!pattern.test(html))throw new Error(`Could not place demo safety script in ${rel}.`);
    html=html.replace(pattern,`$1\n<script src="${safetySrc}"></script>`);
    await writeFile(full,html,'utf8');
  }
}
await injectDemoSafety(out);

const builtConfig=await readFile(configPath,'utf8');
if(!builtConfig.includes('gjzdjotuhfzyihwarpfx')||!builtConfig.includes('iqybnohopudffvfntkit')){
  throw new Error('Demo build points to unexpected Supabase projects.');
}

const builtPortal=await readFile(join(portalRoot,'index.html'),'utf8');
if(!builtPortal.includes('منتجع العرض التجريبي')||builtPortal.includes('أضواء الشرق')){
  throw new Error('Demo portal fallback branding was not sanitized correctly.');
}

console.log('Public demo build prepared in dist/ with current UI assets, sanitized portal fallbacks, and isolated Demo backends.');