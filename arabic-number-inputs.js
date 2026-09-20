(()=>{
'use strict';
if(window.__adwaaArabicNumberInputsInstalled)return;
window.__adwaaArabicNumberInputsInstalled=true;

const ARABIC='٠١٢٣٤٥٦٧٨٩';
const PERSIAN='۰۱۲۳۴۵۶۷۸۹';

function normalizeDigits(value){
  return String(value??'')
    .replace(/[٠-٩]/g,ch=>String(ARABIC.indexOf(ch)))
    .replace(/[۰-۹]/g,ch=>String(PERSIAN.indexOf(ch)))
    .replace(/[٫]/g,'.')
    .replace(/[٬\u00A0\u202F\s]/g,'')
    .replace(/[−–—]/g,'-');
}
function normalizeNumericText(value,{allowDecimal=true,allowNegative=true}={}){
  let text=normalizeDigits(value);
  let negative=allowNegative&&text.includes('-');
  text=text.replace(/[^0-9.]/g,'');
  if(!allowDecimal)text=text.replace(/\./g,'');
  else{
    const first=text.indexOf('.');
    if(first>=0)text=text.slice(0,first+1)+text.slice(first+1).replace(/\./g,'');
  }
  if(negative&&text!=='')text='-'+text;
  return text;
}
function decimalAllowed(input){
  const step=String(input.dataset.numericStep||input.getAttribute('step')||'');
  return !step||step==='any'||step.includes('.')||step==='0.01'||step==='0.1';
}
function negativeAllowed(input){
  const min=input.dataset.numericMin??input.getAttribute('min');
  return min==null||min===''||Number(min)<0;
}
function normalizeInput(input){
  const next=normalizeNumericText(input.value,{allowDecimal:decimalAllowed(input),allowNegative:negativeAllowed(input)});
  if(input.value!==next)input.value=next;
}
function enhance(input){
  if(!(input instanceof HTMLInputElement)||input.dataset.arabicNumericReady==='1')return;
  if(input.type!=='number'&&input.dataset.numericInput!=='1')return;

  input.dataset.arabicNumericReady='1';
  input.dataset.numericInput='1';
  input.dataset.numericMin=input.getAttribute('min')??'';
  input.dataset.numericMax=input.getAttribute('max')??'';
  input.dataset.numericStep=input.getAttribute('step')??'';
  input.type='text';
  input.inputMode=decimalAllowed(input)?'decimal':'numeric';
  input.autocomplete='off';

  const handle=()=>normalizeInput(input);
  input.addEventListener('input',handle);
  input.addEventListener('change',handle);
  input.addEventListener('compositionend',handle);
  input.addEventListener('paste',()=>setTimeout(handle,0));
}
function enhanceTree(root=document){
  if(root instanceof HTMLInputElement)enhance(root);
  root.querySelectorAll?.('input[type="number"],input[data-numeric-input="1"]').forEach(enhance);
}
function install(){
  enhanceTree(document);
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)enhanceTree(node);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

window.normalizeArabicNumber=normalizeDigits;
window.normalizeNumericInputValue=value=>normalizeNumericText(value,{allowDecimal:true,allowNegative:true});
window.enhanceArabicNumericInputs=enhanceTree;

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();