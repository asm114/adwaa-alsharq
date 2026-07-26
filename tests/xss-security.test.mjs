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
  assert.notEqual(brace,-1,`missing body for ${name}`);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

const context={
  location:{origin:'https://asm114.github.io'},
  URL,
  DOMParser:class {}
};
vm.createContext(context);
vm.runInContext([
  functionSource('escapeHtml'),
  functionSource('actionArg'),
  functionSource('safeUrl'),
  functionSource('safeImageUrl')
].join('\n'),context);

const payloads=[
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '</textarea><script>alert(1)</script>',
  '${alert(1)}',
  "';alert(1);//"
];

for(const payload of payloads){
  const escaped=context.escapeHtml(payload);
  assert.equal(/[<>]/.test(escaped),false,`HTML delimiters survived: ${payload}`);
  const decoded=context.actionArg(payload)
    .replaceAll('&quot;','"').replaceAll('&#039;',"'")
    .replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const actionContext={captured:null,alert(){throw new Error('payload executed')}};
  vm.createContext(actionContext);
  vm.runInContext(`captured=${decoded}`,actionContext);
  assert.equal(actionContext.captured,payload,`action argument changed: ${payload}`);
}

for(const unsafe of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','vbscript:msgbox(1)']){
  assert.equal(context.safeUrl(unsafe),'',`unsafe URL accepted: ${unsafe}`);
}
assert.match(context.safeUrl('https://example.com/a'),/^https:/);
assert.match(context.safeUrl('tel:+966500000000'),/^tel:/);
assert.match(context.safeUrl('mailto:test@example.com'),/^mailto:/);

assert.equal(context.safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>'),'');
assert.equal(context.safeImageUrl('data:text/html,<script>alert(1)</script>'),'');
assert.match(context.safeImageUrl('data:image/png;base64,iVBORw0KGgo='),/^data:image\/png/);
assert.match(context.safeImageUrl('blob:https://asm114.github.io/123'),/^blob:/);

assert.equal(/document\.write\s*\(/.test(source),false,'document.write remains');
assert.equal(/v95BookingDetails\('\$\{b\.id\}'\)/.test(source),false,'raw booking id remains in inline JavaScript');
assert.match(source,/data-booking-id="\$\{escapeHtml\(bs\[0\]\.id\)\}"/);

console.log('XSS and URL security tests passed.');
