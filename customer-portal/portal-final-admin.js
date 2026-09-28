const PORTAL_FEEDBACK_TABLE='customer_portal_feedback';
const PORTAL_ACTIVITY_TABLE='customer_portal_activity_log';
const PORTAL_FEEDBACK_BUCKET='customer-portal-feedback';
let portalFeedback=[];
let portalAdminAuthorized=false;

const feedbackLabels={complaint:'شكوى',cleanliness:'نظافة',maintenance:'صيانة أو عطل',suggestion:'اقتراح',thanks:'شكر',other:'أخرى'};
const feedbackStatusLabels={new:'جديدة',in_progress:'قيد المعالجة',completed:'مكتملة',closed:'مغلقة'};
const setSummary=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value??0)};

function installPortalAdminEnhancementStyles(){
  if(document.getElementById('portalAdminEnhancementStyles'))return;
  const style=document.createElement('style');
  style.id='portalAdminEnhancementStyles';
  style.textContent=`
    #adminLoginForm.portal-auth-hidden{display:none!important}
    #adminLogoutButton{margin-top:10px;min-height:42px;padding:8px 18px}
    .portal-unavailable-table-wrap{overflow-x:auto;border:1px solid #e1ddd2;border-radius:16px;background:#fff;margin-top:14px}
    .portal-unavailable-table{width:100%;border-collapse:collapse;min-width:900px;text-align:right}
    .portal-unavailable-table th,.portal-unavailable-table td{padding:12px 10px;border-bottom:1px solid #ebe7dd;vertical-align:middle}
    .portal-unavailable-table th{background:#f3f8f5;color:#123d32;font-size:14px;white-space:nowrap}
    .portal-unavailable-table tbody tr:last-child td{border-bottom:0}
    .portal-unavailable-table tbody tr:hover{background:#fbfaf6}
    .portal-unavailable-table .portal-date-main{display:block;font-weight:800;color:#153c33;white-space:nowrap}
    .portal-unavailable-table .portal-date-full{display:block;margin-top:4px;color:#66756f;font-size:12px;line-height:1.5}
    .portal-unavailable-table .portal-duration{font-weight:800;white-space:nowrap}
    .portal-unavailable-table .portal-row-actions{display:flex;gap:6px;flex-wrap:wrap;white-space:nowrap}
    .portal-unavailable-table .portal-row-actions button{min-height:36px;padding:6px 12px}
    @media(max-width:760px){
      .portal-unavailable-table-wrap{overflow:visible;border:0;background:transparent}
      .portal-unavailable-table{min-width:0;border-collapse:separate;border-spacing:0 10px}
      .portal-unavailable-table thead{display:none}
      .portal-unavailable-table,.portal-unavailable-table tbody,.portal-unavailable-table tr,.portal-unavailable-table td{display:block;width:100%}
      .portal-unavailable-table tr{background:#fff;border:1px solid #e1ddd2;border-radius:14px;padding:8px 12px;box-sizing:border-box}
      .portal-unavailable-table td{display:grid;grid-template-columns:105px 1fr;gap:10px;padding:8px 0;border-bottom:1px dashed #e8e3d8}
      .portal-unavailable-table td:last-child{border-bottom:0}
      .portal-unavailable-table td::before{content:attr(data-label);font-weight:800;color:#123d32}
      .portal-unavailable-table .portal-row-actions{justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);
}

function portalUnavailableDurationDays(startDate,endDate){
  const start=portalDateDays(startDate);
  const end=portalDateDays(endDate);
  return Number.isFinite(start)&&Number.isFinite(end)?Math.max(1,end-start+1):1;
}

function renderPortalUnavailablePeriods(){
  const root=document.getElementById('portalUnavailableList');
  if(!root)return;
  if(!portalUnavailablePeriods.length){
    root.innerHTML='<div class="portal-empty-inline">لا توجد فترات غير متاحة محفوظة بعد.</div>';
    return;
  }
  const rows=portalUnavailablePeriods.map((period,index)=>{
    const duration=portalUnavailableDurationDays(period.start_date,period.end_date);
    return `
      <tr>
        <td data-label="الترتيب">${index+1}</td>
        <td data-label="البداية ميلادي">
          <span class="portal-date-main">${escapeHtml(period.start_date)}</span>
          <span class="portal-date-full">${escapeHtml(portalFormatGregorian(period.start_date))}</span>
        </td>
        <td data-label="البداية هجري"><span class="portal-date-full">${escapeHtml(portalFormatHijri(period.start_date))}</span></td>
        <td data-label="النهاية ميلادي">
          <span class="portal-date-main">${escapeHtml(period.end_date)}</span>
          <span class="portal-date-full">${escapeHtml(portalFormatGregorian(period.end_date))}</span>
        </td>
        <td data-label="النهاية هجري"><span class="portal-date-full">${escapeHtml(portalFormatHijri(period.end_date))}</span></td>
        <td data-label="المدة"><span class="portal-duration">${duration} ${duration===1?'يوم':'أيام'}</span></td>
        <td data-label="الإجراءات">
          <div class="portal-row-actions">
            <button class="secondary" type="button" onclick="editPortalUnavailablePeriod('${period.id}')">تعديل</button>
            <button class="danger" type="button" onclick="deletePortalUnavailablePeriod('${period.id}')">حذف</button>
          </div>
        </td>
      </tr>`;
  }).join('');
  root.innerHTML=`
    <div class="portal-unavailable-table-wrap">
      <table class="portal-unavailable-table">
        <thead>
          <tr>
            <th>#</th>
            <th>البداية بالميلادي</th>
            <th>البداية بالهجري</th>
            <th>النهاية بالميلادي</th>
            <th>النهاية بالهجري</th>
            <th>المدة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function setPortalAdminVisibility(authorized){
  portalAdminAuthorized=Boolean(authorized);
  const shell=document.querySelector('.standalone-shell');
  if(shell)shell.hidden=!portalAdminAuthorized;
  const form=document.getElementById('adminLoginForm');
  if(form){
    form.hidden=portalAdminAuthorized;
    form.classList.toggle('portal-auth-hidden',portalAdminAuthorized);
    form.style.display=portalAdminAuthorized?'none':'';
  }
  let logout=document.getElementById('adminLogoutButton');
  if(!logout){
    logout=document.createElement('button');
    logout.id='adminLogoutButton';
    logout.type='button';
    logout.className='secondary';
    logout.textContent='تسجيل الخروج';
    logout.addEventListener('click',async()=>{
      logout.disabled=true;
      await supabaseClient.auth.signOut();
      currentUser=null;
      setPortalAdminVisibility(false);
      document.getElementById('adminAuthStatus').textContent='تم تسجيل الخروج.';
      logout.disabled=false;
    });
    document.querySelector('.auth-card')?.appendChild(logout);
  }
  logout.hidden=!portalAdminAuthorized;
  logout.style.display=portalAdminAuthorized?'inline-flex':'none';
}

async function verifyPortalAdminAccess(){
  const status=document.getElementById('adminAuthStatus');
  if(status)status.textContent='جاري التحقق من صلاحية المدير...';
  const {data:{user},error:userError}=await supabaseClient.auth.getUser();
  if(userError||!user){
    currentUser=null;
    setPortalAdminVisibility(false);
    if(status)status.textContent='سجل دخول المدير لإدارة بيانات البوابة.';
    return false;
  }
  const {data:isAdmin,error:adminError}=await supabaseClient.rpc('is_resort_admin');
  if(adminError||isAdmin!==true){
    await supabaseClient.auth.signOut();
    currentUser=null;
    setPortalAdminVisibility(false);
    if(status)status.textContent='هذا الحساب لا يملك صلاحية إدارة بوابة العملاء.';
    return false;
  }
  currentUser=user;
  setPortalAdminVisibility(true);
  if(status)status.textContent=`مسجل كمدير: ${user.email||user.id}`;
  return true;
}

async function loadAuthorizedPortalAdminData(){
  if(!portalAdminAuthorized)return;
  await Promise.all([
    loadPortalFinalSummary(),
    loadPortalFeedback(),
    loadPortalActivityLog()
  ]);
}

async function loadPortalFinalSummary(){
  if(!window.supabaseClient||!portalAdminAuthorized)return;
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
  if(!window.supabaseClient||!status||!portalAdminAuthorized)return;
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
  if(!portalAdminAuthorized)return;
  const item=portalFeedback.find(x=>x.id===id);if(!item)return;
  const {error}=await supabaseClient.from(PORTAL_FEEDBACK_TABLE).update({status:item.status,admin_note:item.admin_note,updated_by:currentUser?.id||null}).eq('id',id);
  if(error){alert('تعذر حفظ الملاحظة.');return}await loadPortalFeedback();await loadPortalActivityLog();
}

async function deletePortalFeedback(id){
  if(!portalAdminAuthorized)return;
  const item=portalFeedback.find(x=>x.id===id);if(!item||!confirm('حذف الملاحظة نهائيًا؟ لا يمكن التراجع.'))return;
  const {error}=await supabaseClient.from(PORTAL_FEEDBACK_TABLE).delete().eq('id',id);
  if(error){alert('تعذر حذف الملاحظة.');return}
  if(item.image_paths?.length){const removal=await supabaseClient.storage.from(PORTAL_FEEDBACK_BUCKET).remove(item.image_paths);if(removal.error)alert('حُذفت الملاحظة، لكن تعذر حذف بعض ملفاتها من التخزين. راجع Storage.')}
  await loadPortalFeedback();await loadPortalActivityLog();
}

async function recordPortalBackupAction(description){
  if(!portalAdminAuthorized)return;
  await supabaseClient.from(PORTAL_ACTIVITY_TABLE).insert({action_type:'backup_export',entity_type:'customer_portal_backup',description,admin_id:currentUser?.id||null});
}

async function exportCustomerPortalBackup(){
  if(!portalAdminAuthorized)return;
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
  const root=document.getElementById('portalActivityList');if(!root||!window.supabaseClient||!portalAdminAuthorized)return;
  const {data,error}=await supabaseClient.from(PORTAL_ACTIVITY_TABLE).select('id,action_type,entity_type,entity_id,description,admin_id,created_at').order('created_at',{ascending:false}).limit(100);
  if(error){root.innerHTML='<div class="portal-empty-inline">تعذر تحميل سجل العمليات.</div>';return}
  root.innerHTML=(data||[]).map(item=>`<article class="portal-activity-item"><b>${escapeHtml(item.action_type)} • ${escapeHtml(item.entity_type)}</b><div class="meta">${new Date(item.created_at).toLocaleString('ar-SA')} • المدير: ${escapeHtml(item.admin_id||'—')}<br>${escapeHtml(item.description||'')}</div></article>`).join('')||'<div class="portal-empty-inline">لا توجد عمليات مسجلة بعد.</div>';
}

document.addEventListener('DOMContentLoaded',async()=>{
  installPortalAdminEnhancementStyles();
  setPortalAdminVisibility(false);
  const authorized=await verifyPortalAdminAccess();
  if(authorized)await loadAuthorizedPortalAdminData();

  supabaseClient.auth.onAuthStateChange(async(event)=>{
    if(event==='SIGNED_IN'){
      const allowed=await verifyPortalAdminAccess();
      if(allowed)await loadAuthorizedPortalAdminData();
    }
    if(event==='SIGNED_OUT'){
      currentUser=null;
      setPortalAdminVisibility(false);
    }
  });
});