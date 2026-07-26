import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing ${name}`);
  const openParen=source.indexOf('(',start);
  let parens=0,brace=-1;
  for(let i=openParen;i<source.length;i++){
    if(source[i]==='(')parens++;
    if(source[i]===')'&&--parens===0){brace=source.indexOf('{',i);break}
  }
  let depth=0,inString='',escaped=false;
  for(let i=brace;i<source.length;i++){
    const char=source[i];
    if(inString){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char===inString)inString='';
      continue;
    }
    if(char==="'"||char==='"'||char==='`'){inString=char;continue}
    if(char==='{')depth++;
    if(char==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

const context={
  Blob,
  MAX_BACKUP_FILE_BYTES:25*1024*1024,
  MAX_BACKUP_JSON_DEPTH:24,
  MAX_BACKUP_JSON_NODES:120000,
  MAX_BACKUP_TEXT_LENGTH:1000000,
  FORBIDDEN_OBJECT_KEYS:new Set(['__proto__','constructor','prototype'])
};
vm.createContext(context);
vm.runInContext([
  functionSource('inspectJsonComplexity'),
  functionSource('secureJsonParse'),
  functionSource('sanitizeBackupValue')
].join('\n'),context);

assert.throws(()=>context.secureJsonParse('{"__proto__":{"polluted":true}}'),/محظور/);
assert.throws(()=>context.secureJsonParse('{"constructor":{"prototype":{"polluted":true}}}'),/محظور/);
assert.equal({}.polluted,undefined);

let deep={};
let cursor=deep;
for(let i=0;i<30;i++)cursor=cursor.next={};
assert.throws(()=>context.secureJsonParse(JSON.stringify(deep)),/عمق/);

const huge=JSON.stringify({data:'x'.repeat(1000001)});
assert.throws(()=>context.secureJsonParse(huge),/قيمة نصية/);

const cleaned=context.sanitizeBackupValue({
  name:'safe',
  access_token:'do-not-keep',
  session:{token:'do-not-keep'},
  nested:{password:'do-not-keep',value:1}
});
assert.equal(cleaned.name,'safe');
assert.equal('access_token' in cleaned,false);
assert.equal('session' in cleaned,false);
assert.equal('password' in cleaned.nested,false);
assert.equal(cleaned.nested.value,1);

assert.match(source,/raw\.schemaVersion!==BACKUP_SCHEMA_VERSION/);
assert.match(source,/BACKUP_DATA_FIELDS/);
assert.match(source,/MAX_BACKUP_FILE_BYTES/);
assert.match(source,/secureJsonParse\(text\)/);

console.log('Backup security tests passed.');
