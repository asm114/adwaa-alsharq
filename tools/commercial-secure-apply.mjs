import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assertPathOutsideRepository} from './commercial-provisioner.mjs';

const ROOT_DIR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CORE_MIGRATIONS='supabase/commercial/core/migrations';
const PORTAL_MIGRATIONS='supabase/commercial/portal/migrations';
const PACKAGE_FILES=['provisioning-manifest.json','portal-bootstrap.json','supabase-config.staging.js'];
const KNOWN_PLACEHOLDERS=[
  'CHANGE_ME_DEPLOYMENT_ID','/CHANGE_ME_BASE_PATH/','CHANGE_ME_STORAGE_NAMESPACE',
  'CHANGE_ME_AUTH_NAMESPACE','CHANGE_ME_CACHE_NAMESPACE','CHANGE_ME_BRAND_NAME',
  'CHANGE_ME_BUSINESS_TYPE','CHANGE_ME_LOCATION','CHANGE_ME_BRAND_DESCRIPTION',
  'CHANGE_ME_AUTHORIZED_CUSTOMER','CHANGE_ME_CLIENT_ID','CHANGE_ME_CORE_PROJECT_REF',
  'CHANGE_ME_CORE_PUBLISHABLE_KEY','CHANGE_ME_PORTAL_PROJECT_REF','CHANGE_ME_PORTAL_PUBLISHABLE_KEY'
];
const SECRET_KEY_NAME=/(?:service[_-]?role|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token)/i;
const MIGRATION_NAME=/^\d{14}_[a-z0-9_]+\.sql$/;
const PROPERTY_KEYS=new Set([
  'resortName','shortDescription','detailedDescription','checkinTime','checkoutTime',
  'mapsUrl','whatsappUrl','instagramUrl','resortAddress','checkinInstructions','features',
  'bookingRequestsOpen','closedMessage'
]);
const CONTACT_KEYS=new Set(['whatsappNumber','mapsUrl','instagramUrl','email','contactHours']);

function isObject(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)}
function requiredText(label,value,{min=1,max=500}={}){
  const text=String(value??'').trim();
  if(!text)throw new Error(`${label} مطلوب.`);
  if(text.length<min||text.length>max)throw new Error(`${label} طوله غير صالح.`);
  return text;
}
function optionalText(label,value,{max=1500}={}){
  const text=String(value??'').trim();
  if(text.length>max)throw new Error(`${label} أطول من الحد المسموح.`);
  return text;
}
function assertKnownKeys(label,value,allowed){
  if(!isObject(value))throw new Error(`${label} يجب أن يكون كائنًا.`);
  for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`الحقل غير المعروف ${label}.${key} غير مسموح.`);
}
function assertNoSecretKeys(value,label='package'){
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoSecretKeys(item,`${label}[${index}]`));return}
  if(!isObject(value))return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY_NAME.test(key))throw new Error(`الحقل ${label}.${key} مرفوض: الحزمة العامة لا تحمل أسرارًا.`);
    assertNoSecretKeys(item,`${label}.${key}`);
  }
}
function httpsUrl(label,value,{allowEmpty=false}={}){
  const text=String(value??'').trim();
  if(!text&&allowEmpty)return '';
  requiredText(label,text,{max:2000});
  let parsed;
  try{parsed=new URL(text)}catch{throw new Error(`${label} يجب أن يكون رابط HTTPS صالحًا.`)}
  if(parsed.protocol!=='https:')throw new Error(`${label} يجب أن يبدأ بـ https://`);
  return parsed.toString();
}
function emailValue(label,value){
  const text=String(value??'').trim();
  if(!text)return '';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))throw new Error(`${label} غير صالح.`);
  return text;
}
function validateProjectRef(label,value){
  const ref=requiredText(label,value,{min:10,max:40}).toLowerCase();
  if(!/^[a-z0-9]{10,40}$/.test(ref))throw new Error(`${label} غير صالح.`);
  return ref;
}
function validateClientId(value){
  const clientId=requiredText('clientId',value,{min:4,max:40}).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(clientId))throw new Error('clientId غير صالح.');
  return clientId;
}
function validateDeploymentId(value){
  const deploymentId=requiredText('deploymentId',value,{min:3,max:64}).toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(deploymentId))throw new Error('deploymentId غير صالح.');
  return deploymentId;
}
function validateMigrationNames(label,names){
  if(!Array.isArray(names)||!names.length)throw new Error(`${label} لا يحتوي migrations.`);
  const sorted=[...names].sort();
  const unique=new Set(sorted);
  if(unique.size!==sorted.length)throw new Error(`${label} يحتوي اسم Migration مكررًا.`);
  for(const name of sorted)if(!MIGRATION_NAME.test(name))throw new Error(`اسم Migration غير صالح في ${label}: ${name}`);
  return sorted;
}
function validatePortalBootstrap(value){
  if(!isObject(value)||Number(value.schemaVersion)!==1)throw new Error('portal-bootstrap schemaVersion غير مدعوم.');
  if(!isObject(value.property)||!isObject(value.contact))throw new Error('portal-bootstrap ناقص property/contact.');
  assertNoSecretKeys(value,'portalBootstrap');
  assertKnownKeys('portalBootstrap.property',value.property,PROPERTY_KEYS);
  assertKnownKeys('portalBootstrap.contact',value.contact,CONTACT_KEYS);
  const property=value.property;
  const contact=value.contact;
  const features=property.features??[];
  if(!Array.isArray(features)||features.length>30)throw new Error('property.features يجب أن تكون قائمة بحد أقصى 30 عنصرًا.');
  for(const [index,feature] of features.entries())requiredText(`property.features[${index}]`,feature,{max:120});
  if(property.bookingRequestsOpen!==true&&property.bookingRequestsOpen!==false)throw new Error('property.bookingRequestsOpen يجب أن تكون boolean.');
  requiredText('property.resortName',property.resortName,{max:120});
  requiredText('property.shortDescription',property.shortDescription,{max:220});
  requiredText('property.detailedDescription',property.detailedDescription,{max:2500});
  requiredText('property.checkinTime',property.checkinTime,{max:80});
  requiredText('property.checkoutTime',property.checkoutTime,{max:80});
  httpsUrl('property.mapsUrl',property.mapsUrl,{allowEmpty:true});
  httpsUrl('property.whatsappUrl',property.whatsappUrl,{allowEmpty:true});
  httpsUrl('property.instagramUrl',property.instagramUrl,{allowEmpty:true});
  optionalText('property.resortAddress',property.resortAddress,{max:220});
  optionalText('property.checkinInstructions',property.checkinInstructions,{max:1500});
  requiredText('property.closedMessage',property.closedMessage,{max:500});
  const whatsapp=requiredText('contact.whatsappNumber',contact.whatsappNumber,{min:8,max:15});
  if(!/^\d{8,15}$/.test(whatsapp))throw new Error('contact.whatsappNumber غير صالح.');
  httpsUrl('contact.mapsUrl',contact.mapsUrl);
  httpsUrl('contact.instagramUrl',contact.instagramUrl);
  emailValue('contact.email',contact.email);
  requiredText('contact.contactHours',contact.contactHours,{max:500});
  return value;
}

export function buildSecureApplyPlanFromData({manifest,bootstrap,runtimeConfig,coreMigrations,portalMigrations}){
  if(!isObject(manifest)||Number(manifest.schemaVersion)!==1)throw new Error('provisioning-manifest schemaVersion غير مدعوم.');
  if(manifest.generatedBy!=='commercial-provisioner-phase-1')throw new Error('الحزمة ليست ناتجة من Provisioner Phase 1 المعتمد.');
  assertNoSecretKeys(manifest,'manifest');
  const clientId=validateClientId(manifest.clientId);
  const deploymentId=validateDeploymentId(manifest.deploymentId);
  const coreRef=validateProjectRef('manifest.backends.core.projectRef',manifest.backends?.core?.projectRef);
  const portalRef=validateProjectRef('manifest.backends.portal.projectRef',manifest.backends?.portal?.projectRef);
  if(coreRef===portalRef)throw new Error('Core وPortal يجب أن يكونا مشروعين منفصلين.');
  if(manifest.migrations?.core!==CORE_MIGRATIONS||manifest.migrations?.portal!==PORTAL_MIGRATIONS){
    throw new Error('مسارات migrations في الحزمة لا تطابق المسارات التجارية المعتمدة.');
  }
  validatePortalBootstrap(bootstrap);
  const runtime=String(runtimeConfig||'');
  for(const placeholder of KNOWN_PLACEHOLDERS)if(runtime.includes(placeholder))throw new Error(`Runtime config ما زال يحتوي placeholder فعلي: ${placeholder}`);
  if(!runtime.includes(coreRef)||!runtime.includes(portalRef)||!runtime.includes(clientId))throw new Error('Runtime config لا يطابق هوية ومشاريع الحزمة.');
  const core=validateMigrationNames('Core migrations',coreMigrations);
  const portal=validateMigrationNames('Portal migrations',portalMigrations);
  return Object.freeze({
    schemaVersion:1,mode:'fresh-install-only',clientId,deploymentId,
    targets:Object.freeze({core:Object.freeze({projectRef:coreRef}),portal:Object.freeze({projectRef:portalRef})}),
    migrations:Object.freeze({core:Object.freeze(core),portal:Object.freeze(portal)}),
    bootstrap:Object.freeze(bootstrap),
    safety:Object.freeze({dryRunDefault:true,requiresApplyFlag:true,requiresClientConfirmation:true,secretsFromEnvironmentOnly:true})
  });
}

async function migrationNames(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  return entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.sql')).map(entry=>entry.name);
}

export async function buildSecureApplyPlan(packageDir,{repoRoot=ROOT_DIR}={}){
  const packagePath=assertPathOutsideRepository(packageDir,repoRoot,'مجلد حزمة العميل');
  for(const file of PACKAGE_FILES)await access(path.join(packagePath,file));
  const [manifestText,bootstrapText,runtimeConfig,coreMigrations,portalMigrations]=await Promise.all([
    readFile(path.join(packagePath,'provisioning-manifest.json'),'utf8'),
    readFile(path.join(packagePath,'portal-bootstrap.json'),'utf8'),
    readFile(path.join(packagePath,'supabase-config.staging.js'),'utf8'),
    migrationNames(path.join(repoRoot,CORE_MIGRATIONS)),
    migrationNames(path.join(repoRoot,PORTAL_MIGRATIONS))
  ]);
  let manifest,bootstrap;
  try{manifest=JSON.parse(manifestText)}catch{throw new Error('provisioning-manifest.json ليس JSON صالحًا.')}
  try{bootstrap=JSON.parse(bootstrapText)}catch{throw new Error('portal-bootstrap.json ليس JSON صالحًا.')}
  return buildSecureApplyPlanFromData({manifest,bootstrap,runtimeConfig,coreMigrations,portalMigrations});
}

export function assertApplyConfirmation(plan,{apply=false,confirm=''}={}){
  if(!apply)return Object.freeze({apply:false,mode:'dry-run'});
  if(String(confirm||'').trim().toUpperCase()!==plan.clientId)throw new Error(`للتطبيق الفعلي يجب استخدام --confirm ${plan.clientId}`);
  return Object.freeze({apply:true,mode:'apply'});
}

export function readApplySecrets(env=process.env){
  const read=(name)=>requiredText(name,env[name],{min:1,max:5000});
  const coreDatabaseUrl=read('COMMERCIAL_CORE_DATABASE_URL');
  const portalDatabaseUrl=read('COMMERCIAL_PORTAL_DATABASE_URL');
  const coreServiceRoleKey=read('COMMERCIAL_CORE_SERVICE_ROLE_KEY');
  const portalServiceRoleKey=read('COMMERCIAL_PORTAL_SERVICE_ROLE_KEY');
  const managerEmail=read('COMMERCIAL_MANAGER_EMAIL').toLowerCase();
  const managerPassword=read('COMMERCIAL_MANAGER_PASSWORD');
  if(coreServiceRoleKey.startsWith('sb_publishable_')||portalServiceRoleKey.startsWith('sb_publishable_'))throw new Error('Publishable Key لا يصلح لمرحلة Secure Apply.');
  if(coreServiceRoleKey===portalServiceRoleKey)throw new Error('مفتاحا Core وPortal يجب ألا يكونا نفس القيمة.');
  if(coreDatabaseUrl===portalDatabaseUrl)throw new Error('رابطا قاعدة Core وPortal يجب أن يكونا مختلفين.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail))throw new Error('COMMERCIAL_MANAGER_EMAIL غير صالح.');
  if(managerPassword.length<12)throw new Error('COMMERCIAL_MANAGER_PASSWORD يجب ألا يقل عن 12 حرفًا.');
  return Object.freeze({coreDatabaseUrl,portalDatabaseUrl,coreServiceRoleKey,portalServiceRoleKey,managerEmail,managerPassword});
}

export function parseDatabaseTarget(databaseUrl,expectedProjectRef){
  const expected=validateProjectRef('expectedProjectRef',expectedProjectRef);
  let parsed;
  try{parsed=new URL(databaseUrl)}catch{throw new Error('Database URL غير صالح.')}
  if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('Database URL يجب أن يستخدم postgres/postgresql.');
  const hostname=parsed.hostname.toLowerCase();
  const username=decodeURIComponent(parsed.username||'');
  const directHost=hostname===`db.${expected}.supabase.co`;
  const poolerIdentity=/\.pooler\.supabase\.com$/.test(hostname)&&username.toLowerCase().endsWith(`.${expected}`);
  if(!directHost&&!poolerIdentity)throw new Error(`Database URL لا يطابق Project Ref المتوقع: ${expected}`);
  const password=decodeURIComponent(parsed.password||'');
  const database=decodeURIComponent(parsed.pathname.replace(/^\//,''));
  if(!username||!password||!database)throw new Error('Database URL يجب أن يحتوي المستخدم وكلمة المرور واسم القاعدة.');
  return Object.freeze({
    projectRef:expected,
    public:Object.freeze({host:hostname,port:parsed.port||'5432',database,user:username}),
    pgEnv:Object.freeze({PGHOST:hostname,PGPORT:parsed.port||'5432',PGDATABASE:database,PGUSER:username,PGPASSWORD:password,PGSSLMODE:'require'})
  });
}

export function buildPsqlMigrationArgs(files){
  if(!Array.isArray(files)||!files.length)throw new Error('لا توجد migration files للتطبيق.');
  const args=['-X','-v','ON_ERROR_STOP=1','--single-transaction'];
  for(const file of files)args.push('-f',file);
  return args;
}

function runCommand(command,args,{env=process.env,spawnImpl=spawn}={}){
  return new Promise((resolve,reject)=>{
    const child=spawnImpl(command,args,{env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout?.on('data',chunk=>{stdout+=String(chunk)});
    child.stderr?.on('data',chunk=>{stderr+=String(chunk)});
    child.on('error',reject);
    child.on('close',code=>{
      if(code===0)resolve({stdout,stderr});
      else reject(new Error(`${command} فشل برمز ${code}: ${stderr.trim().slice(0,800)}`));
    });
  });
}
function pgEnv(target){return {...process.env,...target.pgEnv}}
async function assertPsqlAvailable(spawnImpl){await runCommand('psql',['--version'],{spawnImpl})}
async function queryScalar(target,sql,spawnImpl){
  const result=await runCommand('psql',['-X','-v','ON_ERROR_STOP=1','-tA','-c',sql],{env:pgEnv(target),spawnImpl});
  return result.stdout.trim();
}
async function assertFreshDatabase(target,kind,spawnImpl){
  const tables=kind==='core'?['commercial_admins','app_state']:['customer_portal_admins','customer_portal_resort_info','customer_portal_contact'];
  const list=tables.map(name=>`'${name}'`).join(',');
  const sql=`select count(*) from pg_catalog.pg_tables where schemaname='public' and tablename in (${list});`;
  const count=Number(await queryScalar(target,sql,spawnImpl));
  if(!Number.isFinite(count)||count!==0)throw new Error(`${kind} ليس Fresh Install نظيفًا؛ وُجدت جداول تجارية سابقة.`);
}
async function applyMigrations(target,files,spawnImpl){
  await runCommand('psql',buildPsqlMigrationArgs(files),{env:pgEnv(target),spawnImpl});
}
async function verifyTables(target,kind,spawnImpl){
  const tables=kind==='core'?['commercial_admins','app_state']:['customer_portal_admins','customer_portal_resort_info','customer_portal_contact','customer_portal_worker_checks'];
  for(const table of tables){
    const exists=await queryScalar(target,`select to_regclass('public.${table}') is not null;`,spawnImpl);
    if(!/^t(?:rue)?$/i.test(exists))throw new Error(`فشل التحقق من الجدول ${table} في ${kind}.`);
  }
}
function apiHeaders(key,extra={}){return {'apikey':key,'authorization':`Bearer ${key}`,'content-type':'application/json',...extra}}
async function apiRequest({projectRef,key,pathname,method='GET',body,headers={},fetchImpl=fetch}){
  const response=await fetchImpl(`https://${projectRef}.supabase.co${pathname}`,{
    method,headers:apiHeaders(key,headers),body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  if(!response.ok)throw new Error(`Supabase ${method} ${pathname} فشل (${response.status}): ${text.slice(0,500)}`);
  if(!text)return null;
  try{return JSON.parse(text)}catch{return text}
}
async function assertFreshAuth(projectRef,key,fetchImpl){
  const result=await apiRequest({projectRef,key,pathname:'/auth/v1/admin/users?page=1&per_page=2',fetchImpl});
  const users=Array.isArray(result?.users)?result.users:Array.isArray(result)?result:[];
  if(users.length)throw new Error(`Auth في المشروع ${projectRef} ليس فارغًا؛ Secure Apply Phase 1 يعمل على Fresh Install فقط.`);
}
async function createManager(projectRef,key,secrets,fetchImpl){
  const user=await apiRequest({
    projectRef,key,pathname:'/auth/v1/admin/users',method:'POST',fetchImpl,
    body:{email:secrets.managerEmail,password:secrets.managerPassword,email_confirm:true}
  });
  const id=requiredText('Auth user id',user?.id,{min:20,max:80});
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Supabase أعاد Auth UUID غير صالح.');
  return id;
}
async function insertMembership(projectRef,key,table,userId,fetchImpl){
  await apiRequest({
    projectRef,key,pathname:`/rest/v1/${table}`,method:'POST',fetchImpl,
    headers:{prefer:'return=minimal'},body:{user_id:userId}
  });
}
function propertyPayload(property){return {
  id:'main',resort_name:property.resortName,short_description:property.shortDescription,
  detailed_description:property.detailedDescription,checkin_time:property.checkinTime,
  checkout_time:property.checkoutTime,maps_url:property.mapsUrl||'',whatsapp_url:property.whatsappUrl||'',
  instagram_url:property.instagramUrl||'',resort_address:property.resortAddress||'',
  checkin_instructions:property.checkinInstructions||'',features:property.features||[],
  booking_requests_open:property.bookingRequestsOpen,closed_message:property.closedMessage
}}
function contactPayload(contact){return {
  id:'main',whatsapp_number:contact.whatsappNumber,maps_url:contact.mapsUrl,
  instagram_url:contact.instagramUrl,email:contact.email||'',contact_hours:contact.contactHours
}}
async function applyPortalBootstrap(projectRef,key,bootstrap,fetchImpl){
  await apiRequest({projectRef,key,pathname:'/rest/v1/customer_portal_resort_info',method:'POST',fetchImpl,headers:{prefer:'return=minimal'},body:propertyPayload(bootstrap.property)});
  await apiRequest({projectRef,key,pathname:'/rest/v1/customer_portal_contact',method:'POST',fetchImpl,headers:{prefer:'return=minimal'},body:contactPayload(bootstrap.contact)});
}

export async function applySecurePlan(plan,secrets,{repoRoot=ROOT_DIR,spawnImpl=spawn,fetchImpl=fetch}={}){
  const coreTarget=parseDatabaseTarget(secrets.coreDatabaseUrl,plan.targets.core.projectRef);
  const portalTarget=parseDatabaseTarget(secrets.portalDatabaseUrl,plan.targets.portal.projectRef);
  await assertPsqlAvailable(spawnImpl);
  await assertFreshDatabase(coreTarget,'core',spawnImpl);
  await assertFreshDatabase(portalTarget,'portal',spawnImpl);
  await assertFreshAuth(plan.targets.core.projectRef,secrets.coreServiceRoleKey,fetchImpl);
  await assertFreshAuth(plan.targets.portal.projectRef,secrets.portalServiceRoleKey,fetchImpl);
  const coreFiles=plan.migrations.core.map(name=>path.join(repoRoot,CORE_MIGRATIONS,name));
  const portalFiles=plan.migrations.portal.map(name=>path.join(repoRoot,PORTAL_MIGRATIONS,name));
  await applyMigrations(coreTarget,coreFiles,spawnImpl);
  await verifyTables(coreTarget,'core',spawnImpl);
  await applyMigrations(portalTarget,portalFiles,spawnImpl);
  await verifyTables(portalTarget,'portal',spawnImpl);
  const coreUserId=await createManager(plan.targets.core.projectRef,secrets.coreServiceRoleKey,secrets,fetchImpl);
  const portalUserId=await createManager(plan.targets.portal.projectRef,secrets.portalServiceRoleKey,secrets,fetchImpl);
  await insertMembership(plan.targets.core.projectRef,secrets.coreServiceRoleKey,'commercial_admins',coreUserId,fetchImpl);
  await insertMembership(plan.targets.portal.projectRef,secrets.portalServiceRoleKey,'customer_portal_admins',portalUserId,fetchImpl);
  await applyPortalBootstrap(plan.targets.portal.projectRef,secrets.portalServiceRoleKey,plan.bootstrap,fetchImpl);
  return Object.freeze({clientId:plan.clientId,coreProjectRef:plan.targets.core.projectRef,portalProjectRef:plan.targets.portal.projectRef,migrationsApplied:{core:coreFiles.length,portal:portalFiles.length},managerProvisioned:true,portalBootstrapApplied:true});
}

function parseArgs(argv){
  const args={apply:false,confirm:''};
  for(let index=0;index<argv.length;index+=1){
    const token=argv[index];
    if(token==='--package'||token==='--confirm'){
      const value=argv[index+1];
      if(!value||value.startsWith('--'))throw new Error(`${token} يحتاج قيمة.`);
      args[token.slice(2)]=value;index+=1;
    }else if(token==='--apply')args.apply=true;
    else if(token==='--help')args.help=true;
    else throw new Error(`خيار غير معروف: ${token}`);
  }
  return args;
}
async function runCli(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){
    console.log('Dry-run: node tools/commercial-secure-apply.mjs --package /secure/customer-build');
    console.log('Apply:   node tools/commercial-secure-apply.mjs --package /secure/customer-build --apply --confirm CLIENT-ID');
    console.log('الأسرار تُقرأ من متغيرات البيئة COMMERCIAL_* فقط ولا تُقبل كوسائط CLI.');
    return;
  }
  if(!args.package)throw new Error('يجب تحديد --package لمسار حزمة Phase 1 خارج المستودع.');
  const plan=await buildSecureApplyPlan(args.package);
  const mode=assertApplyConfirmation(plan,args);
  console.log(`Secure Apply plan: ${plan.clientId}`);
  console.log(`Core: ${plan.targets.core.projectRef} (${plan.migrations.core.length} migrations)`);
  console.log(`Portal: ${plan.targets.portal.projectRef} (${plan.migrations.portal.length} migrations)`);
  if(!mode.apply){
    console.log('DRY-RUN فقط: لم يتم الاتصال بـSupabase ولم تتم أي كتابة.');
    return;
  }
  const secrets=readApplySecrets(process.env);
  const result=await applySecurePlan(plan,secrets);
  console.log(`Fresh Install اكتمل للحزمة ${result.clientId}.`);
  console.log('لم تُكتب الأسرار إلى GitHub أو حزمة العميل.');
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invoked===import.meta.url){
  runCli().catch(error=>{console.error(`Secure Apply error: ${error.message}`);process.exitCode=1});
}
