(()=>{
'use strict';
// The passphrase and derived key live only in this page. Never store the key beside ciphertext.
const scope=new URL('./',window.location?.href||'https://isolated.invalid/').pathname;
const META='adwaaLocalVault:v1:'+scope;
const CACHE='adwaaDB:protected:'+scope;
const RECOVERY='adwaaLegacyRecovery:v1:'+scope+':';
const purpose='adwaa-local-vault-v1';
const bytes=new TextEncoder(),decode=new TextDecoder();
let key=null;let cacheQueue=Promise.resolve();
const encode=value=>btoa(String.fromCharCode(...value));
const unbase=value=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
const meta=()=>{try{return JSON.parse(localStorage.getItem(META)||'null')}catch(_){return null}};
async function derive(passphrase,salt){
  if(!crypto?.subtle)throw new Error('يلزم اتصال HTTPS ومتصفح يدعم التشفير لحماية البيانات المحلية.');
  const material=await crypto.subtle.importKey('raw',bytes.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:unbase(salt),iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encrypt(value){
  if(!key)throw new Error('افتح التخزين المحلي المحمي بعبارة المرور أولًا.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes.encode(purpose+scope)},key,bytes.encode(JSON.stringify(value))));
  // Chunk encoding avoids call-stack overflow with large backups/photos.
  let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
  return {protected:purpose,scope,iv:encode(iv),ciphertext:btoa(binary)};
}
async function decrypt(value){
  if(!key)throw new Error('التخزين المحلي مقفل. أدخل عبارة المرور لفتح النسخ المحمية.');
  if(value?.protected!==purpose)throw new Error('السجل المحلي غير محمي؛ راجع ترحيل النسخ القديمة.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase(value.iv),additionalData:bytes.encode(purpose+scope)},key,unbase(value.ciphertext));
  return JSON.parse(decode.decode(plain));
}
async function unlock(passphrase){
  const record=meta();if(!record)throw new Error('لم تُهيأ حماية التخزين المحلي بعد.');
  key=await derive(passphrase,record.salt);
  try{const check=await decrypt(record.check);if(check.purpose!==purpose)throw new Error('invalid')}catch(_){key=null;throw new Error('عبارة المرور غير صحيحة أو بيانات الحماية تالفة. لم تُحذف أي بيانات.')}
}
async function create(passphrase){
  if(meta())throw new Error('توجد حماية سابقة. افتحها بعبارة المرور الحالية دون استبدال المفتاح.');
  if(String(passphrase).length<12)throw new Error('استخدم عبارة مرور من 12 حرفًا على الأقل، واحفظها في مدير كلمات المرور.');
  const salt=encode(crypto.getRandomValues(new Uint8Array(16)));
  key=await derive(passphrase,salt);
  const check=await encrypt({purpose});
  try{localStorage.setItem(META,JSON.stringify({salt,check}))}catch(error){key=null;throw error}
}
function legacyKeys(){return Object.keys(localStorage).filter(name=>name==='adwaaDB'||name.startsWith('adwaaPreBookingReconciliation-'))}
async function migrateLocalStorage(){
  for(const name of legacyKeys()){
    const raw=localStorage.getItem(name);if(!raw)continue;
    const value=JSON.parse(raw);if(value?.protected===purpose)continue;
    const encrypted=await encrypt(value);
    if(JSON.stringify(await decrypt(encrypted))!==JSON.stringify(value))throw new Error('فشل تأكيد النسخة المشفرة. بقي الأصل محفوظًا.');
    // Preserve the old unsynced snapshot separately before the active cache can change.
    if(name==='adwaaDB')localStorage.setItem(RECOVERY+Date.now(),JSON.stringify(encrypted));
    // setItem is atomic: on quota failure the old value remains intact.
    localStorage.setItem(name,JSON.stringify(encrypted));
  }
}
async function sealRecord(record){
  if(record?.kind==='directory'||record?.protected===purpose)return record;
  return {id:record.id,...await encrypt(record)};
}
async function openRecord(record){
  if(!record||record.kind==='directory')return record;
  if(record.protected===purpose)return decrypt(record);
  // Legacy backups are not silently discarded. Only the authenticated UI calls this.
  return record;
}
function cache(value){
  if(!key)return Promise.resolve(false);
  const snapshot=JSON.parse(JSON.stringify(value));
  const operation=cacheQueue.then(async()=>{
    if(!key)return false;
    try{
      const existing=localStorage.getItem(CACHE);
      if(existing&&JSON.parse(existing)?.protected!==purpose)return false;
      localStorage.setItem(CACHE,JSON.stringify(await encrypt(snapshot)));return true;
    }catch(_){return false}
  });
  cacheQueue=operation.catch(()=>false);return operation;
}

// Keep Supabase's existing session, but move persistence from disk-wide localStorage
// to this tab. Copy and verify before removing the legacy token; never log its value.
const authKey='sb-'+String(window.ADWAA_SUPABASE_CONFIG?.projectRef||'')+'-auth-token';
const memory=new Map();
const authStorage={
  getItem(name){
    let legacyValue=null;
    try{
      const current=sessionStorage.getItem(name);if(current!==null)return current;
      if(!name.startsWith(authKey)||authKey==='sb--auth-token')return memory.get(name)||null;
      const legacy=localStorage.getItem(name);legacyValue=legacy;if(legacy===null)return null;
      sessionStorage.setItem(name,legacy);
      if(sessionStorage.getItem(name)===legacy)localStorage.removeItem(name);
      return legacy;
    }catch(_){if(legacyValue!==null)memory.set(name,legacyValue);return memory.get(name)||null}
  },
  setItem(name,value){
    memory.set(name,value);
    try{sessionStorage.setItem(name,value);if(sessionStorage.getItem(name)===value&&name.startsWith(authKey))localStorage.removeItem(name)}catch(_){}
  },
  removeItem(name){memory.delete(name);try{sessionStorage.removeItem(name);if(name.startsWith(authKey))localStorage.removeItem(name)}catch(_){}}
};
window.AdwaaLocalVault={authStorage,create,unlock,encrypt,decrypt,migrateLocalStorage,sealRecord,openRecord,cache,
  configured:()=>!!meta(),unlocked:()=>!!key,lock:()=>{key=null},
  scope,cacheKey:CACHE,hasCached:()=>!!localStorage.getItem(CACHE),
  recoveryKeys:()=>Object.keys(localStorage).filter(name=>name.startsWith(RECOVERY)),
  legacyKeys:()=>legacyKeys().filter(name=>{try{return JSON.parse(localStorage.getItem(name))?.protected!==purpose}catch(_){return true}})};
})();
