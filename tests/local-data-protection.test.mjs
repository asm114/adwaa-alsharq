import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../local-data-protection.js',import.meta.url),'utf8');
function setup({pathname='/',projectRef='isolated'}={}){
 const storage={};let fail=false;
 Object.defineProperties(storage,{getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>{if(fail&&k==='adwaaDB')throw Error('quota');storage[k]=v}}});
 const session={};
 Object.defineProperties(session,{getItem:{value:k=>session[k]??null},setItem:{value:(k,v)=>session[k]=v},removeItem:{value:k=>delete session[k]}});
 Object.defineProperty(storage,'removeItem',{value:k=>delete storage[k]});
 const context={ADWAA_SUPABASE_CONFIG:{projectRef},location:{href:'https://qa.invalid'+pathname},sessionStorage:session,URL,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,localStorage:storage};context.window=context;vm.runInNewContext(source,context);
 return{vault:context.AdwaaLocalVault,session,storage,fail:()=>fail=true};
}
const pass='separate recovery passphrase 2026';
const data={bookings:[{id:'isolated',name:'Synthetic private customer',total:1500}],expenses:[{id:'e1',amount:100}],seq:2};
test('locked cache never overwrites plaintext legacy data',async()=>{
 const {vault,storage}=setup();storage.adwaaDB=JSON.stringify(data);
 assert.equal(await vault.cache({bookings:[]}),false);assert.equal(storage.adwaaDB,JSON.stringify(data));
});
test('verified encryption preserves independent recovery snapshot and omits secret text',async()=>{
 const {vault,storage}=setup();storage.adwaaDB=JSON.stringify(data);
 await vault.create(pass);await vault.migrateLocalStorage();
 const sealed=JSON.parse(storage.adwaaDB);assert.equal(JSON.stringify(await vault.decrypt(sealed)),JSON.stringify(data));
 assert.equal(vault.recoveryKeys().length,1);
 await vault.cache({bookings:[]});
 assert.equal(JSON.stringify(await vault.decrypt(JSON.parse(storage[vault.recoveryKeys()[0]]))),JSON.stringify(data));
 assert.ok(!JSON.stringify(storage).includes(data.bookings[0].name));assert.ok(!JSON.stringify(storage).includes(pass));
});
test('wrong passphrase and tampered ciphertext never replace or erase records',async()=>{
 const {vault,storage}=setup();await vault.create(pass);const record=await vault.encrypt(data);const before=JSON.stringify(storage);vault.lock();
 await assert.rejects(vault.unlock('wrong passphrase'));assert.equal(JSON.stringify(storage),before);
 await vault.unlock(pass);const corrupted={...record,ciphertext:record.ciphertext.slice(0,-4)+'AAAA'};
 await assert.rejects(vault.decrypt(corrupted));assert.equal(JSON.stringify(await vault.decrypt(record)),JSON.stringify(data));
});
test('quota failure leaves original legacy snapshot available',async()=>{
 const {vault,storage,fail}=setup();storage.adwaaDB=JSON.stringify(data);await vault.create(pass);fail();
 await assert.rejects(vault.migrateLocalStorage());assert.equal(storage.adwaaDB,JSON.stringify(data));
});
test('backup encryption is lossless and directory handles are not serialized',async()=>{
 const {vault}=setup();await vault.create(pass);const backup={id:'backup',json:JSON.stringify(data),envelope:{data},fileName:'synthetic.json'};
 const encrypted=await vault.sealRecord(backup);assert.ok(!JSON.stringify(encrypted).includes(data.bookings[0].name));
 assert.equal(JSON.stringify(await vault.openRecord(encrypted)),JSON.stringify(backup));
 const directory={id:'directory',kind:'directory',handle:{name:'test'}};assert.equal(await vault.sealRecord(directory),directory);
 vault.lock();await assert.rejects(vault.openRecord(encrypted));
});

test('legacy auth token is copied and verified before removing disk-wide persistence',()=>{
 const {vault,storage,session}=setup();const name='sb-isolated-auth-token';storage[name]='synthetic-token';
 assert.equal(vault.authStorage.getItem(name),'synthetic-token');assert.equal(session[name],'synthetic-token');assert.equal(storage[name],undefined);
 vault.authStorage.setItem(name,'synthetic-refreshed');assert.equal(storage[name],undefined);assert.equal(session[name],'synthetic-refreshed');
 vault.authStorage.removeItem(name);assert.equal(session[name],undefined);
});
test('different deployment paths have separate vaults and active caches',async()=>{
 const first=setup({pathname:'/first/'}),second=setup({pathname:'/second/'});
 assert.notEqual(first.vault.cacheKey,second.vault.cacheKey);
 await first.vault.create(pass);await second.vault.create(pass);
 const record=await first.vault.encrypt(data);await assert.rejects(second.vault.decrypt(record));
});

test('closing the session during key derivation cannot reopen the vault later',async()=>{
 const {vault,storage}=setup();const pending=vault.create(pass);vault.lock();
 await assert.rejects(pending);assert.equal(vault.unlocked(),false);assert.ok(!Object.keys(storage).some(k=>k.startsWith('adwaaLocalVault:')));
});
test('late unlock and decryption results are discarded after the vault locks',async()=>{
 const {vault}=setup();await vault.create(pass);const sealed=await vault.encrypt(data);vault.lock();
 const pending=vault.unlock(pass);vault.lock();await assert.rejects(pending);assert.equal(vault.unlocked(),false);
 await vault.unlock(pass);const opened=vault.decrypt(sealed);vault.lock();await assert.rejects(opened);
 await vault.unlock(pass);assert.equal(JSON.stringify(await vault.decrypt(sealed)),JSON.stringify(data));
});
