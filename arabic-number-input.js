(()=>{
'use strict';
const root=typeof window!=='undefined'?window:globalThis;
if(root.__adwaaArabicNumberInputInstalled)return;
root.__adwaaArabicNumberInputInstalled=true;

const ARABIC_ZERO='٠'.charCodeAt(0);
const PERSIAN_ZERO='۰'.charCodeAt(0);

function asciiDigit(char){
  const code=char.charCodeAt(0);
  if(code>=ARABIC_ZERO&&code<=ARABIC_ZERO+9)return String(code-ARABIC_ZERO);
  if(code>=PERSIAN_ZERO&&code<=PERSIAN_ZERO+9)return String(code-PERSIAN_ZERO);
  return char;
}
function normalizeNumericText(value){
  let text=String(value??'').replace(/[٠-٩۰-۹]/g,asciiDigit)
    .replace(/٫/g,'.')
    .replace(/[٬،,\u00a0\s]/g,'')
    .replace(/[^\d.\-]/g,'');
  const negative=text.startsWith('-');
  text=text.replace(/-/g,'');
  const dot=text.indexOf('.');
  if(dot>=0)text=text.slice(0,dot+1)+text.slice(dot+1).replace(/\./g,'');
  return (negative?'-':'')+text;
}
function parseNumber(value,fallback=0){
  const normalized=normalizeNumericText(value);
  if(!normalized||normalized==='-'||normalized==='.'||normalized==='-.')return fallback;
  const number=Number(normalized);
  return Number.isFinite(number)?number:fallback;
}
function normalizeInput(input){
  if(!(input instanceof HTMLInputElement))return input;
  if(input.dataset.arabicNumberReady==='1')return input;
  const originalType=String(input.getAttribute('type')||'text').toLowerCase();
  if(originalType!=='number'&&input.dataset.numericInput!=='1')return input;
  input.dataset.arabicNumberReady='1';
  input.dataset.originalNumericType=originalType;
  input.dataset.numericInput='1';
  if(originalType==='number')input.type='text';
  input.inputMode='decimal';
  input.autocomplete='off';
  input.setAttribute('dir','ltr');
  return input;
}
function normalizeValue(input){
  if(!(input instanceof HTMLInputElement)||input.dataset.numericInput!=='1')return;
  const next=normalizeNumericText(input.value);
  if(next!==input.value){
    const start=input.selectionStart,end=input.selectionEnd,delta=input.value.length-next.length;
    input.value=next;
    try{
      const pos=Math.max(0,(start??next.length)-delta);
      input.setSelectionRange(pos,Math.max(pos,(end??pos)-delta));
    }catch(_){}
  }
}
function scan(scope=document){
  if(scope instanceof HTMLInputElement)normalizeInput(scope);
  scope.querySelectorAll?.('input[type="number"],input[data-numeric-input="1"]').forEach(normalizeInput);
}

if(typeof document!=='undefined'&&typeof HTMLInputElement!=='undefined'){
  document.addEventListener('focusin',event=>{normalizeInput(event.target);normalizeValue(event.target)},true);
  document.addEventListener('input',event=>{normalizeInput(event.target);normalizeValue(event.target)},true);
  document.addEventListener('change',event=>{normalizeInput(event.target);normalizeValue(event.target)},true);
  document.addEventListener('paste',event=>{
    const input=event.target;
    normalizeInput(input);
    if(!(input instanceof HTMLInputElement)||input.dataset.numericInput!=='1')return;
    const pasted=event.clipboardData?.getData('text');
    if(!pasted)return;
    event.preventDefault();
    const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
    input.value=input.value.slice(0,start)+normalizeNumericText(pasted)+input.value.slice(end);
    normalizeValue(input);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  },true);

  function start(){
    scan();
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)scan(node);
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  root.AdwaaNumberInput={normalizeNumericText,parseNumber,normalizeInput,scan};
}else{
  root.AdwaaNumberInput={normalizeNumericText,parseNumber};
}
if(typeof module!=='undefined'&&module.exports)module.exports={normalizeNumericText,parseNumber};
})();