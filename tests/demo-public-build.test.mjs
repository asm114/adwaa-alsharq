import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const dist=resolve(root,'dist');

async function read(path){
  return readFile(resolve(root,path),'utf8');
}

async function readBuilt(path){
  return readFile(resolve(dist,path),'utf8');
}

test('public demo build uses current UI files and strips AAS portal fallbacks',async()=>{
  const result=spawnSync(process.execPath,['tools/build-demo-deployment.mjs'],{
    cwd:root,
    encoding:'utf8',
    env:{
      ...process.env,
      DEMO_CORE_PUBLISHABLE_KEY:'sb_publishable_test_core',
      DEMO_PORTAL_PUBLISHABLE_KEY:'sb_publishable_test_portal'
    }
  });

  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);

  try{
    const portalHtml=await readBuilt('resort/index.html');
    const portalJs=await readBuilt('resort/portal.js');
    const config=await readBuilt('supabase-config.staging.js');

    assert.match(portalHtml,/منتجع العرض التجريبي/);
    assert.doesNotMatch(portalHtml,/أضواء الشرق|القاع البارد/);
    assert.doesNotMatch(portalJs,/أضواء الشرق|القاع البارد/);
    assert.match(portalJs,/منتجع العرض التجريبي/);
    assert.match(portalHtml,/demo-public-safety\.js/);

    assert.match(config,/gjzdjotuhfzyihwarpfx/);
    assert.match(config,/iqybnohopudffvfntkit/);
    assert.match(config,/sb_publishable_test_core/);
    assert.match(config,/sb_publishable_test_portal/);
    assert.doesNotMatch(config,/CHANGE_ME_|service_role/i);

    for(const asset of [
      'app-experience-pro.css',
      'home-dashboard-polish.css',
      'home-dashboard-polish.js',
      'professional-ui-cleanup.css',
      'professional-ui-cleanup.js',
      'professional-ui-stable.js',
      'simplified-ui.css',
      'simplified-ui-mobile.css',
      'simplified-ui.js'
    ]){
      assert.equal(await readBuilt(asset),await read(asset),`${asset} must be copied from the current demo branch without a stale CDN wrapper.`);
    }
  }finally{
    await rm(dist,{recursive:true,force:true});
  }
});