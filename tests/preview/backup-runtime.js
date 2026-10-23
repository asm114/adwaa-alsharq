'use strict';
window.__previewNativeFetch=window.fetch.bind(window);
var PREVIEW_LIVE=document.body.dataset.live==='true';
var ADWAA_SUPABASE_CONFIG={projectRef:'isolated-preview'};
var APP_VERSION='PR164 isolated __SOURCE_SHA__';
var db=__SYNTHETIC_STATE__,currentUser={id:'synthetic-preview-admin',user_metadata:{full_name:'مدير اختبار مصطنع'}};
var BACKUP_DB_NAME='adwaa-isolated-preview-'+(PREVIEW_LIVE?'live':'mock'),BACKUP_STORE_NAME='backups',BACKUP_DIRECTORY_RECORD_ID='__backup_directory__',BACKUP_DIRECTORY_LABEL_KEY='preview-directory',DATA_PROTECTION_PROVIDER_ID='local',DEFAULT_BACKUP_PATH='تطبيق الملفات — ملف اختبار';
var GOOGLE_DRIVE_FOLDER_NAME='Adwaa PR164 Isolated Test Backups',GOOGLE_DRIVE_STATE_KEY='previewDriveState-'+(PREVIEW_LIVE?'live':'mock');
var googleDriveAccessToken='',googleDriveTokenExpiresAt=0,googleDriveTokenClient=null,googleDriveUploadInProgress=false,googleDriveUploadPromise=null;
var STATE_ROW_ID='main',remoteReady=true,lastSuccessfulWriteAt='',lastSyncError='',lastConfirmedRemoteHash='';
var supabaseClient;
function normalizeDB(value){return structuredClone(value)}
async function persist(){return true}
function safeClone(value){return structuredClone(value)}
function invalidateCaches(){}
function scheduleRenderAll(){}
async function markRemoteStateConfirmed(){}
async function renderDataProtectionSyncStatus(){}
function previewLog(stage,outcome){const box=document.getElementById('previewLog');box.textContent+='\n'+new Date().toISOString()+' '+stage+' '+outcome}
function setSyncStatus(message){previewLog('سجل Supabase الوهمي',message)}
function showLogin(){AdwaaLocalVault.lock();AdwaaPersistence.reset();googleDriveCancelAuth?.();googleDriveAccessToken='';googleDriveTokenExpiresAt=0}
function currentUserLabel(){return 'مدير اختبار مصطنع'}
function setAboutText(id,value){const el=document.getElementById(id);if(el)el.textContent=value}
function formatDateTime(value){return value?new Date(value).toLocaleString('ar-SA'):'—'}
function formatBytes(value){return Number(value)+' bytes'}
function escapeHtml(value){const el=document.createElement('span');el.textContent=String(value??'');return el.innerHTML}
function addAudit(action,entity,details,before,after){db.auditLog.push({id:crypto.randomUUID(),action,entity,details,before,after})}
function money(value){return String(value)}
function getPaidAmount(value){return Number(value.paid||0)}
function getRemainingAmount(value){return Number(value.total||0)-getPaidAmount(value)}
function runSystemHealthChecks(){return {ok:true,checks:[],issues:[]}}
function openModal(id){document.getElementById(id)?.classList.add('open')}
function closeModal(id){document.getElementById(id)?.classList.remove('open')}
function download(name,content,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1500)}
