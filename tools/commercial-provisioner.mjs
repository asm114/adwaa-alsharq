import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const OWNER_NAME='عبدالعزيز الفوزان';
const COPYRIGHT_YEAR=2026;
const ROOT_DIR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DEFAULT_TEMPLATE=path.join(ROOT_DIR,'supabase-config.staging.js');

const TOP_LEVEL_KEYS=new Set(['clientId','deploymentId','runtimeEnvironment','basePath','authorizedCustomer','brand','backends','portal']);
const BRAND_KEYS=new Set(['name','businessType','location','description']);
const BACKENDS_KEYS=new Set(['core','portal']);
const BACKEND_KEYS=new Set(['projectRef','publishableKey']);
const PORTAL_KEYS=new Set(['property','contact']);
const PROPERTY_KEYS=new Set([
  'resortName','shortDescription','detailedDescription','checkinTime','checkoutTime',
  'mapsUrl','whatsappUrl','instagramUrl','resortAddress','checkinInstructions','features',
  'bookingRequestsOpen','closedMessage'
]);
const CONTACT_KEYS=new Set(['whatsappNumber','mapsUrl','instagramUrl','email','contactHours']);
const FORBIDDEN_KEY=/^(?:service[_-]?role(?:[_-]?key)?|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token)$/i;

function isObject(value){
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}

function checkKeys(label,value,allowed){
  if(!isObject(value))throw new Error(`${label} يجب أن يكون كائنًا.`);
  for(const key of Object.keys(value)){
    if(FORBIDDEN_KEY.test(key))throw new Error(`الحقل ${label}.${key} مرفوض: الأسرار لا تدخل في Provisioner التحضيري.`);
    if(!allowed.has(key))throw new Error(`الحقل غير المعروف ${label}.${key} غير مسموح.`);
  }
}

function scanSecrets(value,label='input'){
  if(Array.isArray(value)){
    value.forEach((item,index)=>scanSecrets(item,`${label}[${index}]`));
    return;
  }
  if(!isObject(value))return;
  for(const [key,item] of Object.entries(value)){
    if(FORBIDDEN_KEY.test(key))throw new Error(`الحقل ${label}.${key} مرفوض: لا تخزن كلمات مرور أو Service Role أو Tokens هنا.`);
    scanSecrets(item,`${label}.${key}`);
  }
}

function text(label,value,{min=1,max=500,optional=false}={}){
  const normalized=String(value??'').trim();
  if(!normalized&&optional)return '';
  if(!normalized)throw new Error(`${label} مطلوب.`);
  if(normalized.includes('CHANGE_ME'))throw new Error(`${label} ما زال قيمة placeholder.`);
  if(normalized.length<min||normalized.length>max)throw new Error(`${label} طوله غير صالح.`);
  return normalized;
}

function httpsUrl(label,value,{optional=false}={}){
  const normalized=text(label,value,{max:2000,optional});
  if(!normalized)return '';
  let parsed;
  try{parsed=new URL(normalized)}catch{throw new Error(`${label} يجب أن يكون رابط HTTPS صالحًا.`)}
  if(parsed.protocol!=='https:')throw new Error(`${label} يجب أن يبدأ بـ https://`);
  return parsed.toString();
}

function email(label,value){
  const normalized=String(value??'').trim();
  if(!normalized)return '';
  if(normalized.includes('CHANGE_ME'))throw new Error(`${label} ما زال قيمة placeholder.`);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new Error(`${label} غير صالح.`);
  return normalized;
}

function validateBackend(label,value){
  checkKeys(label,value,BACKEND_KEYS);
  const projectRef=text(`${label}.projectRef`,value.projectRef,{min:10,max:40}).toLowerCase();
  if(!/^[a-z0-9]{10,40}$/.test(projectRef))throw new Error(`${label}.projectRef غير صالح.`);
  const publishableKey=text(`${label}.publishableKey`,value.publishableKey,{min:16,max:300});
  if(!publishableKey.startsWith('sb_publishable_'))throw new Error(`${label}.publishableKey يجب أن يكون Publishable Key فقط.`);
  return Object.freeze({projectRef,publishableKey});
}

function validateProperty(value){
  checkKeys('portal.property',value,PROPERTY_KEYS);
  const rawFeatures=value.features??[];
  if(!Array.isArray(rawFeatures))throw new Error('portal.property.features يجب أن تكون قائمة.');
  if(rawFeatures.length>30)throw new Error('portal.property.features تتجاوز 30 عنصرًا.');
  const features=rawFeatures.map((item,index)=>text(`portal.property.features[${index}]`,item,{max:120}));
  const closedMessage=text('portal.property.closedMessage',value.closedMessage,{max:500,optional:true})||
    'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا للاستفسار.';
  return Object.freeze({
    resortName:text('portal.property.resortName',value.resortName,{max:120}),
    shortDescription:text('portal.property.shortDescription',value.shortDescription,{max:220}),
    detailedDescription:text('portal.property.detailedDescription',value.detailedDescription,{max:2500}),
    checkinTime:text('portal.property.checkinTime',value.checkinTime,{max:80}),
    checkoutTime:text('portal.property.checkoutTime',value.checkoutTime,{max:80}),
    mapsUrl:httpsUrl('portal.property.mapsUrl',value.mapsUrl,{optional:true}),
    whatsappUrl:httpsUrl('portal.property.whatsappUrl',value.whatsappUrl,{optional:true}),
    instagramUrl:httpsUrl('portal.property.instagramUrl',value.instagramUrl,{optional:true}),
    resortAddress:text('portal.property.resortAddress',value.resortAddress,{max:220,optional:true}),
    checkinInstructions:text('portal.property.checkinInstructions',value.checkinInstructions,{max:1500,optional:true}),
    features,
    bookingRequestsOpen:value.bookingRequestsOpen===true,
    closedMessage
  });
}

function validateContact(value){
  checkKeys('portal.contact',value,CONTACT_KEYS);
  const whatsappNumber=text('portal.contact.whatsappNumber',value.whatsappNumber,{min:8,max:15});
  if(!/^[0-9]{8,15}$/.test(whatsappNumber))throw new Error('portal.contact.whatsappNumber يجب أن يحتوي أرقامًا فقط بدون + أو مسافات.');
  return Object.freeze({
    whatsappNumber,
    mapsUrl:httpsUrl('portal.contact.mapsUrl',value.mapsUrl),
    instagramUrl:httpsUrl('portal.contact.instagramUrl',value.instagramUrl),
    email:email('portal.contact.email',value.email),
    contactHours:text('portal.contact.contactHours',value.contactHours,{max:500})
  });
}

export function validateProvisioningInput(input){
  scanSecrets(input);
  checkKeys('input',input,TOP_LEVEL_KEYS);
  checkKeys('brand',input.brand,BRAND_KEYS);
  checkKeys('backends',input.backends,BACKENDS_KEYS);
  checkKeys('portal',input.portal,PORTAL_KEYS);

  const clientId=text('clientId',input.clientId,{min:4,max:40}).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(clientId))throw new Error('clientId غير صالح. استخدم أحرفًا إنجليزية كبيرة وأرقامًا وشرطات فقط.');
  const deploymentId=text('deploymentId',input.deploymentId,{min:3,max:64}).toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(deploymentId))throw new Error('deploymentId غير صالح.');

  const runtimeEnvironment=String(input.runtimeEnvironment||'production').trim().toLowerCase();
  if(!['production','staging'].includes(runtimeEnvironment))throw new Error('runtimeEnvironment يجب أن يكون production أو staging.');
  const basePath=String(input.basePath||`/${deploymentId}/`).trim();
  if(!/^\/(?:[a-z0-9][a-z0-9-]*\/)*$/.test(basePath)||basePath.includes('..')||basePath.includes('//')){
    throw new Error('basePath غير صالح؛ استخدم مسارًا مثل /customer-name/.');
  }

  const brand=Object.freeze({
    name:text('brand.name',input.brand.name,{max:120}),
    businessType:text('brand.businessType',input.brand.businessType,{max:80}),
    location:text('brand.location',input.brand.location,{max:180}),
    description:text('brand.description',input.brand.description,{max:500})
  });
  const authorizedCustomer=text('authorizedCustomer',input.authorizedCustomer,{max:180});
  const core=validateBackend('backends.core',input.backends.core);
  const portal=validateBackend('backends.portal',input.backends.portal);
  if(core.projectRef===portal.projectRef)throw new Error('Core وPortal يجب أن يكونا مشروعين منفصلين في المعمارية الحالية.');

  const namespace=Object.freeze({
    storage:`commercial:${deploymentId}:storage`,
    auth:`commercial-${deploymentId}-auth`,
    cache:`commercial-${deploymentId}-cache`
  });

  return Object.freeze({
    schemaVersion:1,
    clientId,deploymentId,runtimeEnvironment,basePath,namespace,brand,authorizedCustomer,
    backends:Object.freeze({core,portal}),
    portal:Object.freeze({property:validateProperty(input.portal.property),contact:validateContact(input.portal.contact)})
  });
}

function replaceQuoted(source,placeholder,value){
  const needle=`'${placeholder}'`;
  if(!source.includes(needle))throw new Error(`لم يتم العثور على placeholder: ${placeholder}`);
  return source.split(needle).join(JSON.stringify(value));
}

export function renderRuntimeConfig(templateSource,validated){
  let output=String(templateSource);
  const replacements=[
    ['CHANGE_ME_DEPLOYMENT_ID',validated.deploymentId],
    ['/CHANGE_ME_BASE_PATH/',validated.basePath],
    ['CHANGE_ME_STORAGE_NAMESPACE',validated.namespace.storage],
    ['CHANGE_ME_AUTH_NAMESPACE',validated.namespace.auth],
    ['CHANGE_ME_CACHE_NAMESPACE',validated.namespace.cache],
    ['CHANGE_ME_BRAND_NAME',validated.brand.name],
    ['CHANGE_ME_BUSINESS_TYPE',validated.brand.businessType],
    ['CHANGE_ME_LOCATION',validated.brand.location],
    ['CHANGE_ME_BRAND_DESCRIPTION',validated.brand.description],
    ['CHANGE_ME_AUTHORIZED_CUSTOMER',validated.authorizedCustomer],
    ['CHANGE_ME_CLIENT_ID',validated.clientId],
    ['CHANGE_ME_CORE_PROJECT_REF',validated.backends.core.projectRef],
    ['CHANGE_ME_CORE_PUBLISHABLE_KEY',validated.backends.core.publishableKey],
    ['CHANGE_ME_PORTAL_PROJECT_REF',validated.backends.portal.projectRef],
    ['CHANGE_ME_PORTAL_PUBLISHABLE_KEY',validated.backends.portal.publishableKey]
  ];
  for(const [placeholder,value] of replacements)output=replaceQuoted(output,placeholder,value);
  const environmentNeedle="runtimeEnvironment:'production'";
  if(!output.includes(environmentNeedle))throw new Error('تعذر ضبط runtimeEnvironment في قالب النسخة.');
  output=output.replace(environmentNeedle,`runtimeEnvironment:${JSON.stringify(validated.runtimeEnvironment)}`);
  for(const [placeholder] of replacements){
    if(output.includes(`'${placeholder}'`)||output.includes(`"${placeholder}"`)){
      throw new Error(`بقي placeholder غير مستبدل: ${placeholder}`);
    }
  }
  return output;
}

export function buildProvisioningArtifacts(templateSource,input){
  const validated=validateProvisioningInput(input);
  const runtimeConfig=renderRuntimeConfig(templateSource,validated);
  const manifest={
    schemaVersion:1,
    generatedBy:'commercial-provisioner-phase-1',
    clientId:validated.clientId,
    deploymentId:validated.deploymentId,
    runtimeEnvironment:validated.runtimeEnvironment,
    basePath:validated.basePath,
    namespace:validated.namespace,
    brand:validated.brand,
    ownership:{ownerName:OWNER_NAME,copyrightYear:COPYRIGHT_YEAR,authorizedCustomer:validated.authorizedCustomer,clientId:validated.clientId},
    backends:{core:{projectRef:validated.backends.core.projectRef},portal:{projectRef:validated.backends.portal.projectRef}},
    migrations:{core:'supabase/commercial/core/migrations',portal:'supabase/commercial/portal/migrations'},
    phase1Limitations:[
      'لا تنشئ مستخدم Auth ولا تطبق migrations أو بيانات على Supabase.',
      'لا تتعامل مع service-role keys أو كلمات المرور.',
      'يتم تطبيق الحزمة في مرحلة Secure Apply بعد اختبار Fresh Install.'
    ]
  };
  const portalBootstrap={schemaVersion:1,property:validated.portal.property,contact:validated.portal.contact};
  const readme=[
    `Commercial Provisioning Package — ${validated.clientId}`,'',
    `Authorized customer: ${validated.authorizedCustomer}`,
    `Deployment: ${validated.deploymentId}`,
    `Environment: ${validated.runtimeEnvironment}`,'',
    'هذه الحزمة تحضيرية فقط ولا تحتوي Service Role أو كلمات مرور.',
    'الترتيب التالي:',
    '1. إنشاء Core وPortal مستقلين للعميل.',
    '2. تطبيق Commercial Migrations من GitHub على مشروعين نظيفين.',
    '3. تشغيل Secure Apply لإنشاء مدير Auth وربط UUID في جداول العضوية.',
    '4. تطبيق portal-bootstrap.json عبر Secure Apply.',
    '5. اختبار Fresh Install كامل قبل التسليم.','',
    'لا ترفع هذه الحزمة إلى المستودع العام.'
  ].join('\n');
  return Object.freeze({
    validated,
    files:Object.freeze({
      'supabase-config.staging.js':runtimeConfig,
      'provisioning-manifest.json':`${JSON.stringify(manifest,null,2)}\n`,
      'portal-bootstrap.json':`${JSON.stringify(portalBootstrap,null,2)}\n`,
      'README.txt':`${readme}\n`
    })
  });
}

export function assertPathOutsideRepository(targetPath,repoRoot=ROOT_DIR,label='المسار'){
  const absolute=path.resolve(targetPath);
  const relative=path.relative(path.resolve(repoRoot),absolute);
  const inside=relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));
  if(inside)throw new Error(`${label} يجب أن يكون خارج المستودع العام لحماية بيانات العميل.`);
  return absolute;
}

function parseArgs(argv){
  const args={};
  for(let index=0;index<argv.length;index+=1){
    const token=argv[index];
    if(token==='--input'||token==='--output'||token==='--template'){
      const value=argv[index+1];
      if(!value||value.startsWith('--'))throw new Error(`${token} يحتاج قيمة.`);
      args[token.slice(2)]=value;
      index+=1;
    }else if(token==='--help')args.help=true;
    else throw new Error(`خيار غير معروف: ${token}`);
  }
  return args;
}

async function runCli(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){
    console.log('Usage: node tools/commercial-provisioner.mjs --input /secure/customer.json --output /secure/customer-build [--template path]');
    return;
  }
  if(!args.input||!args.output)throw new Error('يجب تحديد --input و --output.');
  const inputPath=assertPathOutsideRepository(args.input,ROOT_DIR,'ملف الإدخال');
  const outputPath=assertPathOutsideRepository(args.output,ROOT_DIR,'مجلد الإخراج');
  const templatePath=path.resolve(args.template||DEFAULT_TEMPLATE);
  const [inputText,templateSource]=await Promise.all([readFile(inputPath,'utf8'),readFile(templatePath,'utf8')]);
  let input;
  try{input=JSON.parse(inputText)}catch{throw new Error('ملف الإدخال ليس JSON صالحًا.')}
  const artifacts=buildProvisioningArtifacts(templateSource,input);
  await mkdir(outputPath,{recursive:false});
  for(const [name,content] of Object.entries(artifacts.files))await writeFile(path.join(outputPath,name),content,{encoding:'utf8',flag:'wx'});
  console.log(`تم تجهيز الحزمة ${artifacts.validated.clientId} في: ${outputPath}`);
  console.log('لم يتم الاتصال بـ Supabase ولم يتم إنشاء مستخدمين أو تعديل بيانات.');
}

const invokedPath=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invokedPath===import.meta.url){
  runCli().catch(error=>{
    console.error(`Provisioner error: ${error.message}`);
    process.exitCode=1;
  });
}
