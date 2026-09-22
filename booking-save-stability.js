(()=>{
'use strict';
if(window.__adwaaBookingSaveStabilityInstalled)return;
window.__adwaaBookingSaveStabilityInstalled=true;

const moneyValue=value=>Math.max(0,Number(value||0));
let saveInFlight=false;
let toastTimer=null;

function injectStyles(){
  if(document.getElementById('bookingSaveStabilityStyles'))return;
  const style=document.createElement('style');
  style.id='bookingSaveStabilityStyles';
  style.textContent=`
    #bookingSaveStatusToast{position:fixed;z-index:999999;top:max(18px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 28px));display:none;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:16px;border:1px solid #d8e1dc;background:#fff;box-shadow:0 16px 45px rgba(15,32,40,.22);font-weight:800;line-height:1.6;direction:rtl}
    #bookingSaveStatusToast.show{display:flex}#bookingSaveStatusToast.saving{border-color:#9db8ad;background:#f4fbf8;color:#164b3e}#bookingSaveStatusToast.success{border-color:#8bc8a8;background:#effbf5;color:#145c3d}#bookingSaveStatusToast.error{border-color:#e1a5a5;background:#fff1f1;color:#8b3030}
    #bookingSaveStatusToast .save-status-icon{font-size:22px;line-height:1.2}#bookingSaveStatusToast .save-status-copy{display:grid;gap:2px}#bookingSaveStatusToast small{font-weight:650;opacity:.86}
    #bookingSaveStatusToast.saving .save-status-icon{animation:adwaaSaveSpin 1s linear infinite}@keyframes adwaaSaveSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}
function toast(){
  injectStyles();
  let node=document.getElementById('bookingSaveStatusToast');
  if(node)return node;
  node=document.createElement('div');node.id='bookingSaveStatusToast';node.setAttribute('role','status');node.setAttribute('aria-live','assertive');
  node.innerHTML='<span class="save-status-icon">⏳</span><span class="save-status-copy"><b></b><small></small></span>';
  document.body.appendChild(node);return node;
}
function showStatus(state,title,detail='',autoHide=0){
  const node=toast();clearTimeout(toastTimer);node.className=`show ${state}`;
  node.querySelector('.save-status-icon').textContent=state==='saving'?'⏳':state==='success'?'✅':'❌';
  node.querySelector('b').textContent=title;node.querySelector('small').textContent=detail||'';
  if(autoHide)toastTimer=setTimeout(()=>node.className='',autoHide);
}
function bookingSubmitButton(){return document.querySelector('#bookingModal button[type="submit"],#bookingModal .modal-footer .primary')}
function setSavingDisabled(disabled){const button=bookingSubmitButton();if(button){button.disabled=!!disabled;button.dataset.bookingSaveBusy=disabled?'1':'0'}}
function preserveNewBookingId(beforeIds){
  const currentId=String(document.getElementById('bId')?.value||'').trim();if(currentId)return currentId;
  const rows=Array.isArray(window.db?.bookings)?window.db.bookings:[];
  const code=String(document.getElementById('bCode')?.value||'').trim();
  const added=rows.find(row=>row?.id&&!beforeIds.has(String(row.id))&&(code?String(row.code||'')===code:true));
  if(added?.id){const input=document.getElementById('bId');if(input)input.value=String(added.id);return String(added.id)}
  return '';
}

function captureRequestedDeposit(){
  const input=document.getElementById('bookingDepositAmount');if(!input)return;
  input.dataset.requestedDeposit=String(input.value??'').trim();
}
function requestedDeposit(){
  const input=document.getElementById('bookingDepositAmount');if(!input)return 0;
  const raw=input.dataset.requestedDeposit!==undefined?input.dataset.requestedDeposit:input.value;
  return moneyValue(raw);
}
function restoreRequestedDeposit(){
  const input=document.getElementById('bookingDepositAmount');if(!input)return;
  const raw=input.dataset.requestedDeposit;if(raw!==undefined)input.value=raw;
}
function isCurrentFormBooking(booking){
  if(!window.BookingFinancialCore?.isFormSaveActive?.())return false;
  if(!booking||booking.recordType==='family')return false;
  const modal=document.getElementById('bookingModal');
  if(!modal?.classList.contains('open'))return false;
  const formId=String(document.getElementById('bId')?.value||'').trim();
  const formCode=String(document.getElementById('bCode')?.value||'').trim();
  if(formId)return String(booking.id||'')===formId;
  return !!formCode&&String(booking.code||'')===formCode;
}

function wrapNormalizeBookingCommission(){
  const current=window.normalizeBookingCommission;
  if(typeof current!=='function'||current.__bookingSaveStabilityDepositGuard)return false;
  const wrapped=function(raw,settings){
    const booking=current.call(this,raw,settings);
    if(!isCurrentFormBooking(booking))return booking;
    const requested=requestedDeposit();
    const payments=Array.isArray(booking.payments)?booking.payments.map(item=>({...item})):[];
    const otherPaid=payments.filter(item=>item.type!=='deposit').reduce((sum,item)=>sum+moneyValue(item.amount),0);
    const total=moneyValue(booking.total);
    const maxDeposit=total>0?Math.max(0,total-otherPaid):Infinity;
    if(Number.isFinite(maxDeposit)&&requested>maxDeposit+0.009){
      restoreRequestedDeposit();
      const extra=otherPaid>0?` توجد دفعات أخرى مسجلة بمجموع ${otherPaid} ر.س.`:'';
      throw new Error(`لم يتم الحفظ: العربون المدخل ${requested} ر.س يتجاوز الحد المتاح ${maxDeposit} ر.س.${extra} راجع إجمالي الحجز والدفعات.`);
    }
    const index=payments.findIndex(item=>item.type==='deposit');
    if(requested>0){
      if(index>=0)payments[index]={...payments[index],amount:requested};
      else payments.unshift({id:window.crypto?.randomUUID?.()||`deposit-${Date.now()}`,amount:requested,type:'deposit',method:document.getElementById('bookingDepositMethod')?.value||'transfer',date:new Date().toISOString().slice(0,10),note:'عربون الحجز',createdAt:new Date().toISOString(),order:0});
    }else if(index>=0)payments.splice(index,1);
    booking.payments=payments;
    const cashPaid=payments.reduce((sum,item)=>sum+moneyValue(item.amount),0);
    const appliedCredit=moneyValue(booking.customerCreditApplied);
    booking.paid=cashPaid+appliedCredit;
    const paid=document.getElementById('bPaid');if(paid)paid.value=String(booking.paid);
    restoreRequestedDeposit();
    return booking;
  };
  wrapped.__bookingSaveStabilityDepositGuard=true;wrapped.__base=current;
  try{normalizeBookingCommission=wrapped}catch(_){}
  window.normalizeBookingCommission=wrapped;return true;
}

function localSavedBooking(id,code){
  const rows=Array.isArray(window.db?.bookings)?window.db.bookings:[];
  return rows.find(row=>(id&&String(row?.id||'')===id)||(code&&String(row?.code||'')===code))||null;
}
function depositFromBooking(booking){
  const payments=Array.isArray(booking?.payments)?booking.payments:[];
  const deposit=payments.find(item=>item?.type==='deposit');
  return deposit?moneyValue(deposit.amount):0;
}
function normalizedPayments(booking){return window.BookingFinancialCore?.normalizePaymentRows(booking?.payments)||[]}
async function verifySavedBookingInSupabase(id,code,requested){
  let client=null,rowId='main';
  try{if(typeof supabaseClient!=='undefined')client=supabaseClient}catch(_){}
  try{if(typeof STATE_ROW_ID!=='undefined'&&STATE_ROW_ID)rowId=STATE_ROW_ID}catch(_){}
  if(!client)throw new Error('تعذر الوصول إلى اتصال Supabase من شاشة الحجز. حدّث الصفحة وسجّل الدخول ثم حاول مرة أخرى.');
  const {data,error}=await client.from('app_state').select('data').eq('id',rowId).maybeSingle();
  if(error)throw new Error(`فشل التحقق من Supabase: ${error.message||error.code||'خطأ غير معروف'}`);
  if(!data?.data)throw new Error('لم يرجع Supabase سجل النظام عند التحقق من الحفظ.');
  const remoteRows=Array.isArray(data.data.bookings)?data.data.bookings:[];
  const remote=remoteRows.find(item=>(id&&String(item?.id||'')===id)||(code&&String(item?.code||'')===code));
  if(!remote)throw new Error(`لم يظهر الحجز ${code||id||''} في Supabase بعد الحفظ.`);
  const local=localSavedBooking(id,code);
  if(local){
    const fields=['code','name','phone','date','type','status','recordType','updatedAt'];
    for(const field of fields){if(String(remote?.[field]??'')!==String(local?.[field]??''))throw new Error(`Supabase لم يؤكد آخر قيمة للحقل ${field}. بقيت شاشة الحجز مفتوحة لحماية البيانات.`)}
    if(Math.abs(moneyValue(remote.total)-moneyValue(local.total))>0.009)throw new Error('إجمالي الحجز في Supabase لا يطابق آخر تعديل.');
    if(Math.abs(moneyValue(remote.paid)-moneyValue(local.paid))>0.009)throw new Error('المدفوع في Supabase لا يطابق آخر تعديل.');
    if(JSON.stringify(normalizedPayments(remote))!==JSON.stringify(normalizedPayments(local)))throw new Error('سجل الدفعات في Supabase لا يطابق سجل الدفعات المحلي.');
  }
  if(requested>0&&Math.abs(depositFromBooking(remote)-requested)>0.009)throw new Error(`تم رفض تأكيد العربون: المطلوب ${requested} ر.س بينما المحفوظ في Supabase ${depositFromBooking(remote)} ر.س.`);
  return remote;
}

function wrapSaveBooking(){
  const current=window.saveBooking;
  if(typeof current!=='function'||current.__bookingSaveStabilityWrapped)return false;
  const wrapped=async function(event){
    if(saveInFlight){event?.preventDefault?.();return}
    captureRequestedDeposit();
    const requested=requestedDeposit();
    const beforeIds=new Set((window.db?.bookings||[]).map(row=>String(row?.id||'')));
    const code=String(document.getElementById('bCode')?.value||'').trim();
    const requestedDate=String(document.getElementById('bDate')?.value||'').trim();
    const postponed=document.getElementById('bStatus')?.value==='مؤجل';
    if(!postponed&&!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)){showStatus('error','تاريخ الحجز غير صالح','اختر تاريخ الحجز بصيغة صحيحة قبل الحفظ.');return false}
    saveInFlight=true;setSavingDisabled(true);showStatus('saving','جاري حفظ الحجز…','يتم الآن حفظ البيانات ثم قراءتها من Supabase للتأكد من نجاح الحفظ.');
    try{
      const result=await current.apply(this,arguments);
      const savedId=preserveNewBookingId(beforeIds);
      const localSaved=localSavedBooking(savedId,code);
      const dateConfirmed=postponed
        ? localSaved?.status==='مؤجل'&&String(localSaved?.date||'')===''
        : String(localSaved?.date||'')===requestedDate;
      if(!localSaved||!dateConfirmed)throw new Error(postponed?'لم يتم تثبيت حالة «مؤجل بلا موعد». بقيت الشاشة مفتوحة لحماية التعديل.':`لم يتم تثبيت تاريخ الحجز المطلوب (${requestedDate}). بقيت الشاشة مفتوحة لحماية التعديل.`);
      await verifySavedBookingInSupabase(savedId,code,requested);
      window.__adwaaLastBookingSaveConfirmed={ok:true,id:savedId,at:new Date().toISOString()};
      showStatus('success','تم حفظ الحجز بنجاح','تمت قراءة الحجز من Supabase وتأكيد آخر البيانات. العقد أصبح متاحًا عند فتح الحجز.',4200);
      return result;
    }catch(error){
      const savedId=preserveNewBookingId(beforeIds);restoreRequestedDeposit();
      const message=String(error?.message||error||'تعذر حفظ الحجز');
      window.__adwaaLastBookingSaveConfirmed={ok:false,id:savedId,error:message,at:new Date().toISOString()};
      document.getElementById('bookingModal')?.classList.add('open');
      showStatus('error','لم يتم تأكيد حفظ الحجز',message);
      console.error('Booking save verification:',error);
      return false;
    }finally{saveInFlight=false;setSavingDisabled(false)}
  };
  wrapped.__bookingSaveStabilityWrapped=true;wrapped.__base=current;
  if(current.__depositRefundPolicyWrapped)wrapped.__depositRefundPolicyWrapped=true;
  window.saveBooking=wrapped;try{saveBooking=wrapped}catch(_){}
  return true;
}

function clarifyUnsavedContract(){
  const card=document.querySelector('[data-v92-action="contract-share-file"]')?.closest('.v92-operation-card')||document.querySelector('[data-v92-action="contract-create"]')?.closest('.v92-operation-card');
  if(!card)return;
  const id=String(document.getElementById('bId')?.value||'').trim();
  const target=card.querySelector('[data-contract-share-target],.meta');
  if(!id&&target)target.textContent='احفظ الحجز وتأكد من ظهور «تم حفظ الحجز بنجاح» ثم يصبح العقد متاحًا.';
}
function install(){
  injectStyles();wrapNormalizeBookingCommission();wrapSaveBooking();clarifyUnsavedContract();
  document.addEventListener('input',event=>{if(event.target?.id==='bookingDepositAmount')captureRequestedDeposit()},true);
  document.addEventListener('change',event=>{if(event.target?.id==='bookingDepositAmount')captureRequestedDeposit()},true);
  let tries=0;const timer=setInterval(()=>{tries++;wrapNormalizeBookingCommission();wrapSaveBooking();clarifyUnsavedContract();if(tries>=24)clearInterval(timer)},250);
}
window.__adwaaBookingSaveStability={requestedDeposit,showStatus,verifySavedBookingInSupabase,isCurrentFormBooking};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
