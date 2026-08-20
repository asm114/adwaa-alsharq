import './build-demo-deployment.mjs';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const out=join(root,'dist');
const externalSupabase=/\s*<script\s+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2[^"']*["'][^>]*><\/script>/gi;

async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){await walk(full);continue;}
    if(!entry.isFile()||!entry.name.endsWith('.html'))continue;
    let html=await readFile(full,'utf8');
    externalSupabase.lastIndex=0;
    if(!externalSupabase.test(html)){externalSupabase.lastIndex=0;continue;}
    externalSupabase.lastIndex=0;
    html=html.replace(externalSupabase,'\n<script src="/demo-supabase-shim.js?v=20260820-2"></script>');
    await writeFile(full,html,'utf8');
  }
}

await walk(out);

const rootHtmlPath=join(out,'index.html');
let rootHtml=await readFile(rootHtmlPath,'utf8');
rootHtml=rootHtml
  .split('منتجع العرض التجريبي').join('نظام إدارة الحجوزات')
  .split('نظام الإدارة المحمي').join('نسخة تجريبية للعرض');
await writeFile(rootHtmlPath,rootHtml,'utf8');

const configPath=join(out,'supabase-config.staging.js');
let demoConfig=await readFile(configPath,'utf8');
demoConfig=demoConfig
  .split("name:'نسخة العرض التجريبية'").join("name:'نسخة تجريبية'")
  .split("businessType:'نظام إدارة المنتجعات'").join("businessType:'نظام إدارة الحجوزات'")
  .split("displayName:'نظام إدارة المنتجعات — نسخة العرض التجريبية'").join("displayName:'نظام إدارة الحجوزات — نسخة تجريبية'")
  .split('نسخة تجريبية لاستعراض نظام إدارة المنتجعات ببيانات وهمية فقط.').join('نسخة تجريبية لاستعراض نظام إدارة الحجوزات ببيانات وهمية فقط.');
await writeFile(configPath,demoConfig,'utf8');

async function verify(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=join(directory,entry.name);
    if(entry.isDirectory()){await verify(full);continue;}
    if(!entry.isFile()||!entry.name.endsWith('.html'))continue;
    const rel=relative(out,full).split(sep).join('/');
    const html=await readFile(full,'utf8');
    if(html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))throw new Error(`Demo output still depends on external Supabase CDN in ${rel}.`);
    if(html.includes('supabase-config.staging.js')&&!html.includes('demo-supabase-shim.js'))throw new Error(`Demo output is missing the local Supabase shim in ${rel}.`);
  }
}

await verify(out);
const verifiedRoot=await readFile(rootHtmlPath,'utf8');
if(verifiedRoot.includes('منتجع العرض التجريبي'))throw new Error('Administration demo still shows the old awkward property name.');
if(!verifiedRoot.includes('نظام إدارة الحجوزات'))throw new Error('Administration demo is missing the approved generic demo name.');
const verifiedConfig=await readFile(configPath,'utf8');
if(!verifiedConfig.includes("displayName:'نظام إدارة الحجوزات — نسخة تجريبية'"))throw new Error('Demo config display name was not normalized.');

console.log('Public demo post-build is fully local, removes the blocking external Supabase CDN, and uses the normalized demo name.');
