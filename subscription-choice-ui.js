(()=>{
'use strict';
if(window.__adwaaSubscriptionChoiceUiInstalled)return;
window.__adwaaSubscriptionChoiceUiInstalled=true;

function applyLabels(){
  const modal=document.getElementById('subscriptionModal');
  if(!modal)return;
  const official=document.getElementById('subConfirm');
  const temporary=document.getElementById('saveSubscriptionDraft');
  if(official){
    official.textContent='✅ اعتماد كاشتراك رسمي';
    official.title='اعتماد الأيام كحجز رسمي حتى لو كان السداد جزئيًا';
  }
  if(temporary){
    temporary.textContent='⏳ حفظ كحجز مبدئي 24 ساعة';
    temporary.title='حجز الأيام مؤقتًا لمدة 24 ساعة مع بقاء المسودة محفوظة بعد انتهاء المهلة';
  }
  let note=document.getElementById('subscriptionChoiceNote');
  const actions=modal.querySelector('.actions');
  if(actions&&!note){
    note=document.createElement('div');
    note.id='subscriptionChoiceNote';
    note.className='subscription-choice-note';
    note.innerHTML='<b>اختر طريقة الحفظ:</b><span>الرسمي يثبت الحجوزات مباشرة، والمؤقت يحجز الأيام لمدة 24 ساعة فقط.</span>';
    actions.parentElement?.insertBefore(note,actions);
  }
}

function installStyle(){
  if(document.getElementById('subscriptionChoiceUiStyle'))return;
  const style=document.createElement('style');
  style.id='subscriptionChoiceUiStyle';
  style.textContent='.subscription-choice-note{margin:12px 0 8px;padding:11px 12px;border:1px solid #e2e4ea;border-radius:13px;background:#fafbfc}.subscription-choice-note b{display:block;margin-bottom:4px}.subscription-choice-note span{font-size:12px;color:var(--muted,#707780);line-height:1.6}';
  document.head.appendChild(style);
}

function init(){installStyle();applyLabels();setTimeout(applyLabels,400);setTimeout(applyLabels,1200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
new MutationObserver(applyLabels).observe(document.documentElement,{childList:true,subtree:true});
})();
