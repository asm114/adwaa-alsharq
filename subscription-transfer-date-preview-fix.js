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
 if(code==='42501')return'صلاحية الكتابة مرفوضة لحساب مدير البوابة';
 if(code==='23503')return'تعذر ربط العملية بحساب مدير البوابة';
 return String(error?.message||'تعذر الحفظ').slice(0,180);
};

async function persistAndRefresh(){
 if(typeof window.persist==='function')await window.persist();
 window.renderAll?.();window.renderCustomers?.();
 window.dispatchEvent(new Event('adwaa-subscription-updated'));
}
async function getPortalTransferContext(){
 const client=window.portalAdminClient;
 if(!client)return {error:'تعذر تهيئة اتصال بوابة العملاء. حدّث الصفحة وحاول مرة أخرى.'};
 const verified=typeof window.verifyPortalAdminSession==='function'?await window.verifyPortalAdminSession():false;
 if(!verified){
  const detail=String(window.portalAdminAuthState?.error||'').trim();
  return {error:`جلسة مدير بوابة العملاء غير مفعلة. سجّل الخروج من النظام ثم ادخل مرة واحدة من جديد${detail?`\n\n${detail}`:''}.`};
 }
 const {data,error}=await client.auth.getSession();
 const session=data?.session;
 if(error||!session?.user)return {error:'انتهت جلسة مدير بوابة العملاء. سجّل الخروج ثم ادخل من جديد.'};
 const primaryEmail=String(window.currentUser?.email||'').trim().toLowerCase();
 const portalEmail=String(session.user.email||'').trim().toLowerCase();
 if(primaryEmail&&portalEmail&&primaryEmail!==portalEmail)return {error:'جلسة مدير البوابة لا تطابق حساب المدير الحالي. سجّل الخروج ثم ادخل من جديد.'};
 return {client,user:session.user};
}
async function transferEntity(entity){
 if(!entity)return;
 const context=await getPortalTransferContext();
 if(context.error){alert(context.error);return}
 const sent=new Set(entity.portalTransferredDates||[]);
 const pending=(entity.dates||[]).filter(date=>date&&!sent.has(date));
 if(!pending.length){alert('جميع الأيام مرحّلة مسبقًا.');return}
 const preview=pending.map(previewLine).join('\n\n');
 if(!confirm(`ترحيل ${pending.length} يومًا إلى تقويم بوابة العملاء؟\n\n${preview}\n\nسيتم جعل هذه الأيام غير متاحة في بوابة العملاء.`))return;
 const table='customer_portal_unavailable_periods',ok=[],failed=[];
 for(const date of pending){
  const result=await context.client.from(table).insert({start_date:date,end_date:date,updated_by:context.user.id});
  if(!result.error){ok.push(date);continue}
  if(isOverlapError(result.error)){
   // اليوم أو فترة تشمل اليوم موجودة مسبقًا؛ لا ننشئ سجلًا مكررًا ونعتبر اليوم مرحّلًا.
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
