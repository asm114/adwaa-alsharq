import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const OWNER_NAME='عبدالعزيز الفوزان';
const COPYRIGHT_YEAR=2026;
const ROOT_DIR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DEFAULT_TEMPLATE=path.join(ROOT_DIR,'supabase-config.staging.js');

const TOP_LEVEL_KEYS=new Set([
  'clientId','deploymentId','runtimeEnvironment','basePath','authorizedCustomer',
  'brand','backends','portal'
]);
const BRAND_KEYS=new Set(['name','businessType','location','description']);
const BACKEND_KEYS=new Set(['projectRef','publishableKey']);
const PORTAL_KEYS=new Set(['property','contact']);
const PROPERTY_KEYS=new Set([
  'resortName','shortDescription','detailedDescription','checkinTime','checkoutTime',
  'mapsUrl','whatsappUrl','instagramUrl','resortAddress','checkinInstructions','features',
  'bookingRequestsOpen','closedMessage'
]);
const CONTACT_KEYS=new Set(['whatsappNumber','mapsUrl','instagramUrl','email','contactHours']);
const FORBIDDEN_KEY=/^(?:service[_-]?role(?:[_-]?key)?|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token)$/i;

function isPlainObject(value){
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}

function assertKnownKeys(label,value,allowed){
  if(!isPlainObject(value))throw new Error(`${label} يجب أن يكون كائنًا.`);
  for(const key of Object.keys(value)){
    if(FORBIDDEN_KEY.test(key))throw new Error(`الحقل ${label}.${key} مرفوض: الأسرار لا تدخل في Provisioner التحضيري.`);
    if(!allowed.has(key))throw new Error(`الحقل غير المعروف ${label}.${key} غير مسموح.`);
  }
}

function scanForbiddenKeys(value,label='input'){
  if(Array.isArray(value)){
    value.forEach((item,index)=>scanForbiddenKeys(item,`${label}[${index}]`));
    return;
  }
  if(!isPlainObject(value))return;
  for(const [key,item] of Object.entries(value)){
    if(FORBIDDEN_KEY.test(key))throw new Error(`الحقل ${label}.${key} مرفوض: لا تخزن كلمات مرور أو Service Role أو Tokens هنا.`);
    scanForbiddenKeys(item,`${label}.${key}`);
  }
}

function requiredText(label,value,{min=1,max=500}={}){
  const text=String(value??'').trim();
  if(!text)throw new Error(`${label} مطلوب.`);
  if(text.includes('CHANGE_ME'))throw new Error(`${label} ما زال قيمة placeholder.`);
  if(text.length<min||text.length>max)throw new Error(`${label} طوله غير صالح.`);
  return text;
}

function optionalText(label,value,{max=1500}={}){
  const text=String(value??'').trim();
  if(text.includes('CHANGE_ME'))throw new Error(`${label} ما زال قيمة placeholder.`);
  if(text.length>max)throw new Error(`${label} أطول من الحد المسموح.`);
  return text;
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

function validateBackend(label,value){
  assertKnownKeys(label,value,BACKEND_KEYS);
  const projectRef=requiredText(`${label}.projectRef`,value.projectRef,{min:10,max:40}).toLowerCase();
  if(!/^[a-z0-9]{10,40}$/.test(projectRef))throw new Error(`${label}.projectRef غير صالح.`);
  const publishableKey=requiredText(`${label}.publishableKey`,value.publishableKey,{min:16,max:300});
  if(!publishableKey.startsWith('sb_publishable_'))throw new Error(`${label}.publishableKey يجب أن يكون Publishable Key فقط.`);
  return {projectRef,publishableKey};
}

function validateProperty(value){
  assertKnownKeys('portal.property',value,PROPERTY_KEYS);
  const features=value.features??[];
  if(!Array.isArray(features))throw new Error('portal.property.features يجب أن تكون قائمة.');
  const normalizedFeatures=features.map((feature,index)=>requiredText(`portal.property.features[${index}]`,feature,{max:120}));
  if(normalizedFeatures.length>30)throw new Error('portal.property.features تتجاوز 30 عنصرًا.');
  const bookingRequestsOpen=value.bookingRequestsOpen===true;
  const closedMessage=optionalText('portal.property.closedMessage',value.closedMessage,{max:500})||
    'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا للاستفسار.';
  return {
    resortName:requiredText('portal.property.resortName',value.resortName,{max:120}),
    shortDescription:requiredText('portal.property.shortDescription',value.shortDescription,{max:220}),
    detailedDescription:requiredText('portal.property.detailedDescription',value.detailedDescription,{max:2500}),
    checkinTime:requiredText('portal.property.checkinTime',value.checkinTime,{max:80}),
    checkoutTime:requiredText('portal.property.checkoutTime',value.checkoutTime,{max:80}),
    mapsUrl:httpsUrl('portal.property.mapsUrl',value.mapsUrl,{allowEmpty:true}),
    whatsappUrl:httpsUrl('portal.property.whatsappUrl',value.whatsappUrl,{allowEmpty:true}),
    instagramUrl:httpsUrl('portal.property.instagramUrl',value.instagramUrl,{allowEmpty:true}),
    resortAddress:optionalText('portal.property.resortAddress',value.resortAddress,{max:220}),
    checkinInstructions:optionalText('portal.property.checkinInstructions',value.checkinInstructions,{max:1500}),
    features:normalizedFeatures,
    bookingRequestsOpen,
    closedMessage
  };
}

function validateContact(value){
  assertKnownKeys('portal.contact',value,CONTACT_KEYS);
  const whatsappNumber=requiredText('portal.contact.whatsappNumber',value.whatsappNumber,{min:8,max:15});
  if(!/^[0-9]{8,15}$/.test(whatsappNumber))throw new Error('portal.contact.whatsappNumber يجب أن يحتوي أرقامًا فقط بدون + أو مسافات.');
  return {
    whatsappNumber,
    mapsUrl:httpsUrl('portal.contact.mapsUrl',value.mapsUrl),
    instagramUrl:httpsUrl('portal.contact.instagramUrl',value.instagramUrl),
    email:emailValue('portal.contact.email',value.email),
    contactHours:requiredText('portal.contact.contactHours',value.contactHours,{max:500})
  };
}

export function validateProvisioningInput(input){
  scanForbiddenKeys(input);
  assertKnownKeys('input',input,TOP_LEVEL_KEYS);
  assertKnownKeys('brand',input.brand,BRAND_KEYS);
  assertKnownKeys('backends',input.backends,new Set(['core','portal']));
  assertKnownKeys('portal',input.portal,PORTAL_KEYS);

  const clientId=requiredText('clientId',input.clientId,{min:4,max:40}).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(clientId))throw new Error('clientId غير صالح. استخدم أحرفًا إنجليزية كبيرة وأرقامًا وشرطات فقط.');

  const deploymentId=requiredText('deploymentId',input.deploymentId,{min:3,max:64}).toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(deploymentId))throw new Error('deploymentId غير صالح.');

  const runtimeEnvironment=String(input.runtimeEnvironment||'production').trim().toLowerCase();
  if(!['production','staging'].includes(runtimeEnvironment))throw new Error('runtimeEnvironment يجب أن يكون production أو staging.');

  const basePath=String(input.basePath||`/${deploymentId}/`).trim();
  if(!/^\/(?:[a-z0-9][a-z0-9-]*\/)*$/.test(basePath))throw new Error('basePath غير صالح؛ استخدم مسارًا مثل /customer-name/.');
  if(basePath.includes('..')||basePath.includes('//'))throw new Error('basePath يحتوي مسارًا غير آمن.');

  const brand={
    name:requiredText('brand.name',input.brand.name,{max:120}),
    businessType:requiredText('brand.businessType',input.brand.businessType,{max:80}),
    location:requiredText('brand.location',input.brand.location,{max:180}),
    description:requiredText('brand.description',input.brand.description,{max:500})
  };
  const authorizedCustomer=requiredText('authorizedCustomer',input.authorizedCustomer,{max:180});
  const core=validateBackend('backends.core',input.backends.core);
  const portal=validateBackend('backends.portal',input.backends.portal);
  if(core.projectRef===portal.projectRef)throw new Error('Core وPortal يجب أن يكونا مشروعين منفصلين في المعمارية الحالية.');

  const namespace={
    storage:`commercial:${deploymentId}:storage`,
    auth:`commercial-${deploymentId}-auth`,
    cache:`commercial-${deploymentId}-cache`
  };

  return Object.freeze({
    schemaVersion:1,
    clientId,deploymentId,runtimeEnvironment,basePath,namespace,brand,authorizedCustomer,
    backends:Object.freeze({core:Object.freeze(core),portal:Object.freeze(portal)}),
    portal:Object.freeze({
      property:Object.freeze(validateProperty(input.portal.property)),
      contact:Object.freeze(validateContact(input.portal.contact))
    })
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
  output=output.replace("runtimeEnvironment:'production'",`runtimeEnvironment:${JSON.stringify(validated.runtimeEnvironment)}`);
  if(/CHANGE_ME_/.test(output))throw new Error('بقيت قيم CHANGE_ME في إعداد النسخة بعد التوليد.');
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
    ownership:{
      ownerName:OWNER_NAME,
      copyrightYear:COPYRIGHT_YEAR,
      authorizedCustomer:validated.authorizedCustomer,
      clientId:validated.clientId
    },
    backends:{
      core:{projectRef:validated.backends.core.projectRef},
      portal:{projectRef:validated.backends.portal.projectRef}
    },
    migrations:{
      core:'supabase/commercial/core/migrations',
      portal:'supabase/commercial/portal/migrations'
    },
    phase1Limitations:[
      'لا تنشئ مستخدم Auth ولا تطبق migrations أو بيانات على Supabase.',
      'لا تتعامل مع service-role keys أو كلمات المرور.',
      'يتم تطبيق الحزمة في مرحلة Secure Apply بعد اختبار Fresh Install.'
    ]
  };
  const portalBootstrap={schemaVersion:1,property:validated.portal.property,contact:validated.portal.contact};
  const readme=[
    `Commercial Provisioning Package — ${validated.clientId}`,
    '',
    `Authorized customer: ${validated.authorizedCustomer}`,
    `Deployment: ${validated.deploymentId}`,
    `Environment: ${validated.runtimeEnvironment}`,
    '',
    'هذه الحزمة تحضيرية فقط ولا تحتوي Service Role أو كلمات مرور.',
    'الترتيب التالي:',
    '1. إنشاء Core وPortal مستقلين للعميل.',
    '2. تطبيق Commercial Migrations من GitHub على مشروعين نظيفين.',
    '3. تشغيل Secure Apply لإنشاء مدير Auth وربط UUID في جداول العضوية.',
    '4. تطبيق portal-bootstrap.json عبر Secure Apply.',
    '5. اختبار Fresh Install كامل قبل التسليم.',
    '',
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
  const isInside=relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));
  if(isInside)throw new Error(`${label} يجب أن يكون خارج المستودع العام لحماية بيانات العميل.`);
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
