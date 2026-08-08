(()=>{
'use strict';
if(window.__adwaaSubscriptionTransferDatePreviewFixInstalled)return;
window.__adwaaSubscriptionTransferDatePreviewFixInstalled=true;

const parseIso=value=>{const [y,m,d]=String(value||'').split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):null};
const gregorianLabel=value=>{
 const date=parseIso(value);if(!date)return String(value||'');
 const weekday=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long'}).format(date);
 const numeric=`${String(date.getDate()).padStart(2,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${date.getFullYear()}`;
 return `${weekday}، ${numeric}`;
};
const hijriLabel=value=>{
 const date=parseIso(value);if(!date)return'';
 return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric'}).format(date);
};
const previewLine=value=>`ميلادي: ${gregorianLabel(value)}\nهجري: ${hijriLabel(value)}`;
const isOverlapError=error=>String(error?.code||'')==='23P01'||/overlap|exclusion constraint|conflicting key value/i.test(String(error?.message||''));
const conciseError=error=>{
 const code=String(error?.code||'').trim();
 if(code==='42501')return'صلاحية الكتابة مرفوضة لحساب المدير';
 if(code==='23503')return'تعذر ربط العملية بحساب المدير';
 return String(error?.message||'تعذر الحفظ').slice(0,180);
};

async function persistAndRefresh(){
 if(typeof window.persist==='function')await window.persist();
 if(typeof window.loadPortalUnavailablePeriods==='function')await window.loadPortalUnavailablePeriods();
 window.renderAll?.();window.renderCustomers?.();
 window.dispatchEvent(new Event('adwaa-subscription-updated'));
}
async function transferEntity(entity){
 if(!entity)return;
 if(!window.supabaseClient){alert('الاتصال ببوابة العملاء غير متاح.');return}
 const sent=new Set(entity.portalTransferredDates||[]);
 const pending=(entity.dates||[]).filter(date=>date&&!sent.has(date));
 if(!pending.length){alert('جميع الأيام مرحّلة مسبقًا.');return}
 const preview=pending.map(previewLine).join('\n\n');
 if(!confirm(`ترحيل ${pending.length} يومًا إلى تقويم بوابة العملاء؟\n\n${preview}\n\nسيتم جعل هذه الأيام غير متاحة في بوابة العملاء.`))return;
 const table='customer_portal_unavailable_periods',ok=[],failed=[];
 for(const date of pending){
  const result=await window.supabaseClient.from(table).insert({start_date:date,end_date:date,updated_by:window.currentUser?.id||null});
  if(!result.error){ok.push(date);continue}
  if(isOverlapError(result.error)){
   // اليوم أو فترة تشمل اليوم موجودة مسبقًا؛ نعتبره متاحًا للترحيل بدون إنشاء صف مكرر.
   ok.push(date);continue;
  }
  console.error('subscription portal transfer failed',date,result.error);
  failed.push({date,error:conciseError(result.error)});
 }
 entity.portalTransferredDates=[...new Set([...(entity.portalTransferredDates||[]),...ok])];
 entity.portalTransferFailures=failed.map(item=>item.date);
 entity.portalTransferredAt=new Date().toISOString();
 await persistAndRefresh();
 if(!failed.length){alert('✅ تم ترحيل جميع الأيام إلى تقويم بوابة العملاء.');return}
 const details=failed.map(item=>`${item.date}: ${item.error}`).join('\n');
 alert(`تم ترحيل ${ok.length} يوم، وتعذر ترحيل ${failed.length} يوم.\n\n${details}`);
}
function official(id){return (window.db?.subscriptions||[]).find(item=>item?.id===id)||null}
function draft(id){return (window.db?.subscriptionDrafts||[]).find(item=>item?.id===id)||null}
window.transferOfficialSubscriptionToPortal=id=>transferEntity(official(id));
window.transferSubscriptionDraftToPortal=id=>{
 const item=draft(id);if(!item||item.status!=='approved'){alert('اعتمد الاشتراك أولًا.');return}
 return transferEntity(item);
};
})();
