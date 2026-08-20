import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const dist=resolve(root,'dist');

async function read(path){return readFile(resolve(root,path),'utf8')}
async function readBuilt(path){return readFile(resolve(dist,path),'utf8')}

test('demo local runtime is valid JavaScript and contains no privileged secret',()=>{
  const syntax=spawnSync(process.execPath,['--check','demo-local-runtime.js'],{cwd:root,encoding:'utf8'});
  assert.equal(syntax.status,0,`${syntax.stdout}\n${syntax.stderr}`);
  const source=spawnSync(process.execPath,['-e',"const fs=require('fs');process.stdout.write(fs.readFileSync('demo-local-runtime.js','utf8'))"],{cwd:root,encoding:'utf8'}).stdout;
  assert.match(source,/demo\.visitor@example\.invalid/);
  assert.match(source,/__adwaaLocalDemoClient/);
  assert.match(source,/adwaa_demo_local_\$\{scope\}_v3/);
  assert.doesNotMatch(source,/service_role|demo\.admin@example\.com/i);
});

test('public demo build uses current UI, fully local state, and scrubbed demo data',async()=>{
  const result=spawnSync(process.execPath,['tools/build-demo-deployment.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);

  try{
    const rootHtml=await readBuilt('index.html');
    const portalHtml=await readBuilt('resort/index.html');
    const portalJs=await readBuilt('resort/portal.js');
    const portalAdminJs=await readBuilt('portal-admin.js');
    const localRuntime=await readBuilt('demo-local-runtime.js');
    const config=await readBuilt('supabase-config.staging.js');

    assert.match(rootHtml,/demo-public-safety\.js/);
    assert.match(rootHtml,/demo-local-runtime\.js/);
    assert.ok(rootHtml.indexOf('@supabase/supabase-js@2')<rootHtml.indexOf('demo-local-runtime.js'),'local demo runtime must load after the Supabase browser library');
    assert.doesNotMatch(rootHtml,/أضواء الشرق|القاع البارد|966560442799|0560442799/);

    assert.match(portalHtml,/منتجع العرض التجريبي/);
    assert.doesNotMatch(portalHtml,/أضواء الشرق|القاع البارد|966560442799|0560442799/);
    assert.doesNotMatch(portalJs,/أضواء الشرق|القاع البارد|966560442799|0560442799/);
    assert.match(portalJs,/منتجع العرض التجريبي/);
    assert.match(portalHtml,/demo-public-safety\.js/);
    assert.match(portalHtml,/\.\.\/demo-local-runtime\.js/);
    assert.ok(portalHtml.indexOf('@supabase/supabase-js@2')<portalHtml.indexOf('demo-local-runtime.js'),'portal demo runtime must load after the Supabase browser library');

    assert.doesNotMatch(portalAdminJs,/أضواء الشرق|القاع البارد|966560442799|0560442799|uh8t93tMm5agNWvx7|adwaa_al_sharq_resort/);
    assert.match(portalAdminJs,/منتجع العرض التجريبي|العرض التجريبي/);

    assert.match(config,/democorelocal2026/);
    assert.match(config,/demoportallocal2026/);
    assert.match(config,/sb_publishable_demo_local_core_2026/);
    assert.match(config,/sb_publishable_demo_local_portal_2026/);
    assert.match(config,/basePath:'\/'/);
    assert.doesNotMatch(config,/CHANGE_ME_|service_role|\.supabase\.co/i);

    assert.match(localRuntime,/__adwaaLocalDemoClient/);
    assert.match(localRuntime,/adwaa_demo_local_\$\{scope\}_v3/);
    assert.match(localRuntime,/makeClient\('core'/);
    assert.match(localRuntime,/makeClient\('portal'/);
    assert.doesNotMatch(localRuntime,/service_role|demo\.admin@example\.com/i);

    for(const asset of [
      'app-experience-pro.css','home-dashboard-polish.css','home-dashboard-polish.js',
      'professional-ui-cleanup.css','professional-ui-cleanup.js','professional-ui-stable.js',
      'simplified-ui.css','simplified-ui-mobile.css','simplified-ui.js','demo-local-runtime.js'
    ]){
      assert.equal(await readBuilt(asset),await read(asset),`${asset} must come from the current demo branch without a stale wrapper.`);
    }
  }finally{
    await rm(dist,{recursive:true,force:true});
  }
});