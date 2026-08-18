import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

const productionRef='pgdvlklpyrvmwzitsmbw';
const stagingRef='ztqqdjryvecscidxxbfe';

test('بوابة العملاء تحمل إعداد البيئة قبل إنشاء Supabase client',async()=>{
  const html=await read('resort/index.html');
  assert.match(html,/\.\.\/supabase-config\.staging\.js\?v=20260819-1[\s\S]*supabase-js@2[\s\S]*supabase-runtime-bridge\.js\?v=20260819-1[\s\S]*portal\.js\?v=20260819-1/);
});

test('جسر بوابة العملاء يوجه العميل القديم إلى إعداد البيئة النشط',async()=>{
  const source=await read('resort/supabase-runtime-bridge.js');
  const calls=[];
  const context={
    URL,
    window:{
      ADWAA_SUPABASE_CONFIG:{
        url:`https://${productionRef}.supabase.co`,
        publishableKey:'sb_publishable_production',
        projectRef:productionRef,
        runtimeEnvironment:'production'
      },
      supabase:{
        createClient(url,key,options){calls.push({url,key,options});return {url,key,options}}
      }
    }
  };
  vm.runInNewContext(source,context);
  context.window.supabase.createClient(`https://${stagingRef}.supabase.co`,'sb_publishable_staging',{auth:{persistSession:false}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,`https://${productionRef}.supabase.co`);
  assert.equal(calls[0].key,'sb_publishable_production');
});

test('الجسر لا يغير عميل Supabase غير الخاص بمشروع Staging القديم',async()=>{
  const source=await read('resort/supabase-runtime-bridge.js');
  const calls=[];
  const context={
    URL,
    window:{
      ADWAA_SUPABASE_CONFIG:{
        url:`https://${stagingRef}.supabase.co`,
        publishableKey:'sb_publishable_staging',
        projectRef:stagingRef,
        runtimeEnvironment:'staging'
      },
      supabase:{
        createClient(url,key,options){calls.push({url,key,options});return {url,key,options}}
      }
    }
  };
  vm.runInNewContext(source,context);
  const other='another-project';
  context.window.supabase.createClient(`https://${other}.supabase.co`,'sb_publishable_other',{});
  assert.equal(calls[0].url,`https://${other}.supabase.co`);
  assert.equal(calls[0].key,'sb_publishable_other');
});
