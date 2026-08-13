const PORTAL_FEEDBACK_TABLE='customer_portal_feedback';
const PORTAL_ACTIVITY_TABLE='customer_portal_activity_log';
const PORTAL_FEEDBACK_BUCKET='customer-portal-feedback';
let portalFeedback=[];

const feedbackLabels={complaint:'شكوى',cleanliness:'نظافة',maintenance:'صيانة أو عطل',suggestion:'اقتراح',thanks:'شكر',other:'أخرى'};
const feedbackStatusLabels={new:'جديدة',in_progress:'قيد المعالجة',completed:'مكتملة',closed:'مغلقة'};
const setSummary=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value??0)};

async function loadPortalFinalSummary(){
  if(!window.supabaseClient)return;
  const [visitors,images,periods,seasons,feedback]=await Promise.all([
    supabaseClient.from('customer_portal_visitor_counter').select('total_count').eq('id','main').maybeSingle(),
    supabaseClient.from(PORTAL_IMAGES_TABLE).select('id',{count:'exact',head:true}).eq('is_visible',true),
    supabaseClient.from(PORTAL_UNAVAILABLE_TABLE).select('id',{count:'exact',head:true}),
    supabaseClient.from(PORTAL_SEASONS_TABLE).select('id',{count:'exact',head:true}).eq('is_active',true),
    supabaseClient.from(PORTAL_FEEDBACK_TABLE).select('id',{count:'exact',head:true}).eq('status','new')
  ]);
  setSummary('portalSummaryVisitors',visitors.data?.total_count||0);
  setSummary('portalSummaryImages',images.count||0);
  setSummary('portalSummaryUnavailable',periods.count||0);
  setSummary('portalSummarySeasons',seasons.count||0);
  setSummary('portalSummaryFeedback',feedback.count||0);
}

async function loadPortalFeedback(){
  const status=document.getElementById('portalFeedbackStatus');
  if(!window.supabaseClient||!status)return;
  status.textContent='جاري تحميل الملاحظات...';
  const {data,error}=await supabaseClient.from(PORTAL_FEEDBACK_TABLE).select('id,category,message,customer_name,contact_number,image_paths,status,admin_note,created_at').order('created_at',{ascending:false});
  if(error){status.textContent='تعذر تحميل الملاحظات.';status.className='portal-inline-status error';return}
  portalFeedback=data||[];
  status.textContent=portalFeedback.length?`عدد الملاحظات: ${portalFeedback.length}`:'لا توجد ملاحظات.';
  status.className='portal-inline-status success';
  await renderPortalFeedback();
  loadPortalFinalSummary();
}

async function renderPortalFeedback(){
  const root=document.getElementById('portalFeedbackList');if(!root)return;
  if(!portalFeedback.length){root.innerHTML='<div class="portal-empty-inline">لا توجد ملاحظات حتى الآن.</div>';return}
  const signed={};
  for(const item of portalFeedback){
    if(item.image_paths?.length){
      const {data}=await supabaseClient.storage.from(PORTAL_FEEDBACK_BUCKET).createSignedUrls(item.image_paths,900);
      signed[item.id]=(data||[]).map(x=>x.signedUrl).filter(Boolean);
    }
  }
  root.innerHTML=portalFeedback.map(item=>`<article class="portal-feedback-item">
    <div class="portal-feedback-head"><div><h4>${escapeHtml(feedbackLabels[item.category]||item.category)}</h4><div class="meta">${new Date(item.created_at).toLocaleString('ar-SA')} • ${escapeHtml(item.customer_name||'بدون اسم')} • ${escapeHtml(item.contact_number||'بدون رقم')}</div></div><span class="portal-image-flag ${item.status==='new'?'cover':'visible'}">${escapeHtml(feedbackStatusLabels[item.status]||item.status)}</span></div>
    <p>${escapeHtml(item.message)}</p>
    ${(signed[item.id]||[]).length?`<div class="portal-feedback-images">${signed[item.id].map(url=>`<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="صورة مرفقة بالملاحظة"></a>`).join('')}</div>`:''}
    <div class="portal-feedback-controls"><select onchange="updatePortalFeedbackDraft('${item.id}','status',this.value)">${Object.entries(feedbackStatusLabels).map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select><textarea maxlength="4000" oninput="updatePortalFeedbackDraft('${item.id}','admin_note',this.value)" placeholder="ملاحظة داخلية لا تظهر للعميل">${escapeHtml(item.admin_note||'')}</textarea></div>
    <div class="portal-image-actions"><button class="primary" type="button" onclick="savePortalFeedback('${item.id}')">حفظ الحالة</button><button class="danger" type="button" onclick="deletePortalFeedback('${item.id}')">حذف</button></div>
  </article>`).join('');
}

function updatePortalFeedbackDraft(id,key,value){const item=portalFeedback.find(x=>x.id===id);if(item)item[key]=value}

async function savePortalFeedback(id){
  const item=portalFeedback.find(x=>x.id===id);if(!item)return;
  const {error}=await supabaseClient.from(PORTAL_FEEDBACK_TABLE).update({status:item.status,admin_note:item.admin_note,updated_by:currentUser?.id||null}).eq('id',id);
  if(error){alert('تعذر حفظ الملاحظة.');return}await loadPortalFeedback();await loadPortalActivityLog();
}

async function deletePortalFeedback(id){
  const item=portalFeedback.find(x=>x.id===id);if(!item||!confirm('حذف الملاحظة نهائيًا؟ لا يمكن التراجع.'))return;
  const {error}=await supabaseClient.from(PORTAL_FEEDBACK_TABLE).delete().eq('id',id);
  if(error){alert('تعذر حذف الملاحظة.');return}
  if(item.image_paths?.length){const removal=await supabaseClient.storage.from(PORTAL_FEEDBACK_BUCKET).remove(item.image_paths);if(removal.error)alert('حُذفت الملاحظة، لكن تعذر حذف بعض ملفاتها من التخزين. راجع Storage.')}
  await loadPortalFeedback();await loadPortalActivityLog();
}

async function recordPortalBackupAction(description){
  await supabaseClient.from(PORTAL_ACTIVITY_TABLE).insert({action_type:'backup_export',entity_type:'customer_portal_backup',description,admin_id:currentUser?.id||null});
}

async function exportCustomerPortalBackup(){
  const tables=['customer_portal_resort_info','customer_portal_images','customer_portal_unavailable_periods','customer_portal_pricing','customer_portal_seasons','customer_portal_contact','customer_portal_visitor_counter'];
  const backup={format:'adwaa-customer-portal-backup',version:1,created_at:new Date().toISOString(),data:{}};
  for(const table of tables){const {data,error}=await supabaseClient.from(table).select('*');if(error){alert(`تعذر إنشاء نسخة كاملة عند جدول ${table}. لم يتم تنزيل ملف جزئي.`);return}backup.data[table]=data||[]}
  const feedback=await supabaseClient.from(PORTAL_FEEDBACK_TABLE).select('id,category,message,customer_name,contact_number,image_paths,status,admin_note,created_at,updated_at,updated_by');
  if(feedback.error){alert('تعذر إنشاء نسخة كاملة عند جدول الملاحظات. لم يتم تنزيل ملف جزئي.');return}
  backup.data[PORTAL_FEEDBACK_TABLE]=feedback.data||[];
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`adwaa-customer-portal-${backup.created_at.slice(0,19).replace(/[:T]/g,'-')}.json`;link.click();URL.revokeObjectURL(url);
  await recordPortalBackupAction(`إنشاء نسخة بوابة الإصدار ${backup.version}`);await loadPortalActivityLog();
}

async function loadPortalActivityLog(){
  const root=document.getElementById('portalActivityList');if(!root||!window.supabaseClient)return;
  const {data,error}=await supabaseClient.from(PORTAL_ACTIVITY_TABLE).select('id,action_type,entity_type,entity_id,description,admin_id,created_at').order('created_at',{ascending:false}).limit(100);
  if(error){root.innerHTML='<div class="portal-empty-inline">تعذر تحميل سجل العمليات.</div>';return}
  root.innerHTML=(data||[]).map(item=>`<article class="portal-activity-item"><b>${escapeHtml(item.action_type)} • ${escapeHtml(item.entity_type)}</b><div class="meta">${new Date(item.created_at).toLocaleString('ar-SA')} • المدير: ${escapeHtml(item.admin_id||'—')}<br>${escapeHtml(item.description||'')}</div></article>`).join('')||'<div class="portal-empty-inline">لا توجد عمليات مسجلة بعد.</div>';
}

document.addEventListener('DOMContentLoaded',()=>{loadPortalFinalSummary();loadPortalFeedback();loadPortalActivityLog()});

(()=>{const script=document.createElement('script');script.src='booking-payment-history.js?v=20260813-1';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='customer-subscriptions.js';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='subscription-booking-type.js?v=20260813-4';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='booking-customer-groups.js?v=20260808-3';script.defer=true;script.onerror=()=>console.warn('تعذر تحميل تجميع الحجوزات حسب العميل');document.head.appendChild(script)})();
(()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='simplified-ui.css?v=20260806-2';document.head.appendChild(link);const script=document.createElement('script');script.src='simplified-ui.js?v=20260806-2';script.defer=true;document.head.appendChild(script)})();
(()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='drive-stability-ui.css?v=20260813-1';link.dataset.driveStabilityUi='1';document.head.appendChild(link);const script=document.createElement('script');script.src='drive-manual-ui.js?v=20260813-1';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='quick-home-backup.js?v=20260807-1';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='dashboard-drilldown.js?v=20260807-1';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='home-interactions.js?v=20260807-2';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='browser-controls.js?v=20260807-1';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='document-preview-controls.js?v=20260808-1';script.defer=true;document.head.appendChild(script)})();
(()=>{const script=document.createElement('script');script.src='portal-booking-sync-stable.js?v=20260813-3';script.defer=true;script.onerror=()=>console.warn('تعذر تحميل المزامنة المستقرة مع بوابة العملاء');document.head.appendChild(script)})();
