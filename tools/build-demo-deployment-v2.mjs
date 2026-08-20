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
    if(!externalSupabase.test(html)){externalSupabase.lastIndex=0;continue;}
    externalSupabase.lastIndex=0;
    html=html.replace(externalSupabase,'\n<script src="/demo-supabase-shim.js?v=20260820-1"></script>');
    await writeFile(full,html,'utf8');
  }
}

await walk(out);

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
console.log('Public demo post-build removed the blocking external Supabase CDN and uses the local demo shim only.');
