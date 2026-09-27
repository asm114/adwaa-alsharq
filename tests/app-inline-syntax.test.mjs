import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const entry of ['index.html','worker-check.html','cleaner.html','resort/index.html','resort/feedback.html']){
 test('inline scripts compile: '+entry,async()=>{
  const html=await readFile(new URL('../'+entry,import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(!/src=|application\/ld\+json/.test(match[1])&&match[2].trim())assert.doesNotThrow(()=>new vm.Script(match[2],{filename:entry}));
  }
 });
}
