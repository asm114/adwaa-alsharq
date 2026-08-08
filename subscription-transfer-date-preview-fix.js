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
 const table='customer_portal_unavailable_periods';
 const existing=await window.supabaseClient.from(table).select('start_date,end_date');
 if(existing.error){console.error(existing.error);alert('تعذر فحص تقويم البوابة. لم يتم ترحيل أي يوم.');return}
 const covered=date=>(existing.data||[]).some(period=>period.start_date<=date&&period.end_date>=date);
 const ok=[],failed=[];
 for(const date of pending){
  if(covered(date)){ok.push(date);continue}
  const result=await window.supabaseClient.from(table).insert({start_date:date,end_date:date,updated_by:window.currentUser?.id||null});
  if(result.error){console.error(result.error);failed.push(date)}else ok.push(date)
 }
 entity.portalTransferredDates=[...new Set([...(entity.portalTransferredDates||[]),...ok])];
 entity.portalTransferFailures=failed;
 entity.portalTransferredAt=new Date().toISOString();
 await persistAndRefresh();
 alert(failed.length?`تم ترحيل ${ok.length} يوم، وتعذر ترحيل ${failed.length} يوم.`:'✅ تم ترحيل جميع الأيام إلى تقويم بوابة العملاء.');
}
function official(id){return (window.db?.subscriptions||[]).find(item=>item?.id===id)||null}
function draft(id){return (window.db?.subscriptionDrafts||[]).find(item=>item?.id===id)||null}
window.transferOfficialSubscriptionToPortal=id=>transferEntity(official(id));
window.transferSubscriptionDraftToPortal=id=>{
 const item=draft(id);if(!item||item.status!=='approved'){alert('اعتمد الاشتراك أولًا.');return}
 return transferEntity(item);
};
})();
